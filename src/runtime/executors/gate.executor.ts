/**
 * Gate Executor
 *
 * Handles GATE step execution for human-in-the-loop approval workflows.
 * When a pipeline reaches a GATE step, records are captured and the pipeline
 * pauses to await human approval (or auto-approves based on configuration).
 *
 * Features:
 * - MANUAL: Always pauses for explicit human approval
 * - THRESHOLD: Auto-approves if error rate is below configured threshold
 * - TIMEOUT: Auto-approves after a configured delay via background checker
 * - Webhook notifications: POST to a URL when gate is reached
 * - Email notifications: Send email via SMTP when gate is reached
 */

import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { TransactionalConnection, RequestContext } from '@vendure/core';
import * as nodemailer from 'nodemailer';
import { PipelineStepDefinition, PipelineContext, JsonValue, JsonObject } from '../../types/index';
import type { DataHubPluginOptions } from '../../types/index';
import { RecordObject, ExecutorContext } from '../executor-types';
import { DATAHUB_PLUGIN_OPTIONS, HTTP_HEADERS, CONTENT_TYPES, INTERNAL_TIMINGS, TIME } from '../../constants/index';
import { RunStatus } from '../../constants/enums';
import { validateUrlSafety } from '../../utils/url-security.utils';
import { getErrorMessage } from '../../utils/error.utils';
import { deepClone } from '../../utils/object-path.utils';
import { PipelineRun } from '../../entities/pipeline/pipeline-run.entity';
import { PipelineService } from '../../services/pipeline/pipeline.service';
import { DomainEventsService } from '../../services/events/domain-events.service';

const logger = new Logger('DataHub:GateExecutor');

/** Default number of records to include in the gate preview */
const DEFAULT_PREVIEW_COUNT = 10;

/** Checkpoint key prefix for gate timeout entries */
const GATE_TIMEOUT_PREFIX = '__gateTimeout:';

export interface GateStepConfig {
    approvalType: 'MANUAL' | 'THRESHOLD' | 'TIMEOUT';
    timeoutSeconds?: number;
    errorThresholdPercent?: number;
    notifyWebhook?: string;
    notifyEmail?: string;
    previewCount?: number;
}

export interface GateResult {
    paused: boolean;
    pendingRecords: RecordObject[];
    previewRecords: RecordObject[];
    stepKey: string;
    config: GateStepConfig;
}

@Injectable()
export class GateExecutor implements OnModuleInit, OnModuleDestroy {
    private timeoutCheckHandle: ReturnType<typeof setInterval> | null = null;
    private pipelineService: PipelineService | null = null;

    constructor(
        private moduleRef: ModuleRef,
        private connection: TransactionalConnection,
        @Inject(DATAHUB_PLUGIN_OPTIONS) private options: DataHubPluginOptions,
        private domainEvents: DomainEventsService,
    ) {}

    onModuleInit(): void {
        // Lazily resolve PipelineService via ModuleRef to avoid circular DI
        // (PipelineService → AdapterRuntime → GateExecutor)
        try {
            this.pipelineService = this.moduleRef.get(PipelineService, { strict: false });
        } catch {
            logger.debug('PipelineService not available for gate timeout auto-approval');
        }

        this.startTimeoutChecker();
    }

    onModuleDestroy(): void {
        if (this.timeoutCheckHandle) {
            clearInterval(this.timeoutCheckHandle);
            this.timeoutCheckHandle = null;
        }
    }

    /**
     * Execute a GATE step.
     *
     * Captures the input records and returns a GateResult indicating whether
     * the pipeline should pause for approval or auto-approve and continue.
     *
     * Auto-approve conditions:
     * - THRESHOLD mode: auto-approves if no error threshold is configured,
     *   or if the current error rate is below the configured threshold.
     *
     * For MANUAL mode the pipeline always pauses.
     *
     * TIMEOUT mode: stores expiry in checkpoint. A background checker
     * periodically scans for expired timeouts and auto-approves them.
     */
    async execute(
        _ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        executorCtx: ExecutorContext,
        _pipelineContext?: PipelineContext,
    ): Promise<GateResult> {
        const config = (step.config ?? {}) as unknown as GateStepConfig;
        const previewCount = config.previewCount ?? DEFAULT_PREVIEW_COUNT;

        // Check if gate was already approved (resuming after gate approval)
        const approvalKey = `__gateApproved:${step.key}`;
        if (executorCtx.cpData?.[approvalKey]) {
            logger.log(`GATE step "${step.key}": already approved, continuing pipeline`);
            delete executorCtx.cpData[approvalKey];
            executorCtx.markCheckpointDirty();
            return {
                paused: false,
                pendingRecords: input,
                previewRecords: input.slice(0, previewCount),
                stepKey: step.key,
                config,
            };
        }

        // --- THRESHOLD mode ---
        if (config.approvalType === 'THRESHOLD') {
            const shouldAutoApprove = this.evaluateThreshold(config, executorCtx);
            if (shouldAutoApprove) {
                logger.log(`GATE step "${step.key}": THRESHOLD auto-approved (error rate below threshold or no errors)`);
                return {
                    paused: false,
                    pendingRecords: input,
                    previewRecords: input.slice(0, previewCount),
                    stepKey: step.key,
                    config,
                };
            }
            // Threshold exceeded or stats unavailable -> pause (safe default)
        }

        // TIMEOUT mode: save expiry checkpoint for the background checker
        if (config.approvalType === 'TIMEOUT' && config.timeoutSeconds) {
            const expiresAt = new Date(Date.now() + config.timeoutSeconds * TIME.SECOND).toISOString();
            this.saveTimeoutToCheckpoint(step.key, expiresAt, executorCtx);
            logger.log(`GATE "${step.key}": TIMEOUT mode, will auto-approve at ${expiresAt}`);
        }

        // Save checkpoint for paused gate
        this.saveGateCheckpoint(step.key, config, input, executorCtx);

        // Fire-and-forget notifications
        this.sendNotifications(step.key, config, input);

        return {
            paused: true,
            pendingRecords: input,
            previewRecords: input.slice(0, previewCount),
            stepKey: step.key,
            config,
        };
    }

    // ──────────────────────────────────────────────────────────────
    // Notifications
    // ──────────────────────────────────────────────────────────────

    /**
     * Dispatch webhook and email notifications for a paused gate (fire-and-forget).
     */
    private sendNotifications(stepKey: string, config: GateStepConfig, records: RecordObject[]): void {
        if (config.notifyWebhook) {
            this.sendWebhookNotification(config.notifyWebhook, stepKey, config, records).catch(err =>
                logger.warn(`GATE "${stepKey}": webhook notification failed: ${getErrorMessage(err)}`),
            );
        }
        if (config.notifyEmail) {
            this.sendEmailNotification(config.notifyEmail, stepKey, config, records).catch(err =>
                logger.warn(`GATE "${stepKey}": email notification failed: ${getErrorMessage(err)}`),
            );
        }
    }

    /**
     * POST gate information to a webhook URL with SSRF protection.
     */
    private async sendWebhookNotification(
        url: string,
        stepKey: string,
        config: GateStepConfig,
        records: RecordObject[],
    ): Promise<void> {
        const safety = await validateUrlSafety(url);
        if (!safety.safe) {
            logger.warn(`GATE "${stepKey}": webhook blocked by SSRF protection: ${safety.reason}`);
            return;
        }

        const fetchImpl = (globalThis as { fetch?: typeof fetch }).fetch;
        if (!fetchImpl) {
            logger.warn(`GATE "${stepKey}": fetch API not available, skipping webhook`);
            return;
        }

        const previewCount = config.previewCount ?? DEFAULT_PREVIEW_COUNT;
        const payload = {
            event: 'gate.reached',
            stepKey,
            approvalType: config.approvalType,
            recordCount: records.length,
            previewRecords: records.slice(0, previewCount),
            timestamp: new Date().toISOString(),
        };

        const response = await fetchImpl(url, {
            method: 'POST',
            headers: { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON },
            body: JSON.stringify(payload),
        });

        logger.log(`GATE "${stepKey}": webhook notification sent (status=${response.status})`);
    }

    /**
     * Send a gate notification email via SMTP.
     * Requires `notifications.smtp` to be configured in plugin options.
     */
    private async sendEmailNotification(
        email: string,
        stepKey: string,
        config: GateStepConfig,
        records: RecordObject[],
    ): Promise<void> {
        const smtpConfig = this.options.notifications?.smtp;
        if (!smtpConfig) {
            logger.warn(
                `GATE "${stepKey}": email notification skipped — ` +
                'configure notifications.smtp in DataHubPlugin.init() options',
            );
            return;
        }

        const transporter = nodemailer.createTransport({
            host: smtpConfig.host,
            port: smtpConfig.port,
            secure: smtpConfig.secure ?? (smtpConfig.port === 465),
            auth: smtpConfig.auth ? {
                user: smtpConfig.auth.user,
                pass: smtpConfig.auth.pass,
            } : undefined,
        });

        const previewCount = config.previewCount ?? DEFAULT_PREVIEW_COUNT;
        const previewJson = JSON.stringify(records.slice(0, previewCount), null, 2);

        try {
            await transporter.sendMail({
                from: smtpConfig.from || smtpConfig.auth?.user || 'datahub@localhost',
                to: email,
                subject: `[DataHub] Gate "${stepKey}" requires approval`,
                text: [
                    `Pipeline gate "${stepKey}" has been reached and requires approval.`,
                    '',
                    `Approval type: ${config.approvalType}`,
                    `Records pending: ${records.length}`,
                    config.approvalType === 'TIMEOUT' && config.timeoutSeconds
                        ? `Auto-approves in: ${config.timeoutSeconds} seconds`
                        : '',
                    '',
                    `Preview (first ${Math.min(records.length, previewCount)} records):`,
                    previewJson,
                ].filter(Boolean).join('\n'),
            });

            logger.log(`GATE "${stepKey}": email notification sent to ${email}`);
        } finally {
            transporter.close();
        }
    }

    // ──────────────────────────────────────────────────────────────
    // TIMEOUT auto-approval
    // ──────────────────────────────────────────────────────────────

    /**
     * Start the periodic checker for expired gate timeouts.
     */
    private startTimeoutChecker(): void {
        this.timeoutCheckHandle = setInterval(() => {
            this.checkExpiredGates().catch(err =>
                logger.warn(`Gate timeout check failed: ${getErrorMessage(err)}`),
            );
        }, INTERNAL_TIMINGS.GATE_TIMEOUT_CHECK_INTERVAL_MS);

        // Don't prevent Node process from exiting
        if (this.timeoutCheckHandle.unref) {
            this.timeoutCheckHandle.unref();
        }

        logger.debug('Gate timeout checker started', {
            intervalMs: INTERNAL_TIMINGS.GATE_TIMEOUT_CHECK_INTERVAL_MS,
        });
    }

    /**
     * Scan PAUSED pipeline runs for expired gate timeouts and auto-approve them.
     *
     * This checker runs on a periodic interval, so there is eventual consistency
     * between when a timeout expires and when the gate is auto-approved. The
     * actual approval time may lag behind the configured timeout by up to one
     * check interval (GATE_TIMEOUT_CHECK_INTERVAL_MS).
     */
    private async checkExpiredGates(): Promise<void> {
        if (!this.pipelineService) return;

        const ctx = RequestContext.empty();
        const repo = this.connection.getRepository(ctx, PipelineRun);

        const pausedRuns = await repo.find({
            where: { status: RunStatus.PAUSED },
            select: ['id', 'checkpoint'],
        });

        const now = Date.now();

        for (const run of pausedRuns) {
            if (!run.checkpoint) continue;

            for (const [key, value] of Object.entries(run.checkpoint)) {
                if (!key.startsWith(GATE_TIMEOUT_PREFIX)) continue;

                const data = value as Record<string, JsonValue>;
                const expiresAt = data?.expiresAt as string | undefined;
                if (!expiresAt) continue;

                const expiresAtMs = new Date(expiresAt).getTime();
                if (expiresAtMs <= now) {
                    const stepKey = data.stepKey as string;
                    const delayMs = now - expiresAtMs;
                    logger.log(
                        `GATE "${stepKey}": TIMEOUT expired, auto-approving run ${run.id} ` +
                        `(expected=${expiresAt}, actual delay=${delayMs}ms)`,
                    );
                    try {
                        this.domainEvents.publishGateTimeout(
                            undefined,
                            String(run.id),
                            stepKey,
                        );
                    } catch {
                        // Gate timeout event is non-critical
                    }
                    try {
                        await this.pipelineService.approveGate(ctx, run.id, stepKey);
                    } catch (err) {
                        logger.warn(`GATE "${stepKey}": auto-approval failed for run ${run.id}: ${getErrorMessage(err)}`);
                    }
                }
            }
        }
    }

    // ──────────────────────────────────────────────────────────────
    // Threshold evaluation
    // ──────────────────────────────────────────────────────────────

    /**
     * Evaluate whether THRESHOLD mode should auto-approve.
     *
     * Checks the execution context checkpoint for error/success counts
     * (stored by previous steps). If stats are available, computes the error
     * rate and compares against the configured threshold.
     *
     * If no threshold is configured, or no error stats are available, returns
     * true (auto-approve) as a pragmatic default when there is nothing to block on.
     */
    private evaluateThreshold(config: GateStepConfig, executorCtx: ExecutorContext): boolean {
        // No threshold configured: auto-approve
        if (config.errorThresholdPercent === undefined) {
            return true;
        }

        // Try to read error/success counts from checkpoint data
        const cpData = executorCtx.cpData;
        if (!cpData) {
            // No checkpoint data available - default to pausing (safe default)
            return false;
        }

        // Look for aggregated stats in checkpoint under a well-known key
        const stats = cpData['__pipelineStats'] as Record<string, JsonValue> | undefined;
        if (!stats) {
            // No stats tracked - default to pausing (safe default)
            return false;
        }

        const errorCount = typeof stats['errorCount'] === 'number' ? stats['errorCount'] : 0;
        const successCount = typeof stats['successCount'] === 'number' ? stats['successCount'] : 0;
        const totalCount = errorCount + successCount;

        if (totalCount === 0) {
            // No records processed yet - auto-approve (nothing to evaluate)
            return true;
        }

        const errorRate = (errorCount / totalCount) * 100;
        logger.log(
            `GATE THRESHOLD evaluation: errorRate=${errorRate.toFixed(2)}%, ` +
            `threshold=${config.errorThresholdPercent}%, ` +
            `errors=${errorCount}, successes=${successCount}`,
        );

        return errorRate < config.errorThresholdPercent;
    }

    // ──────────────────────────────────────────────────────────────
    // Checkpoint management
    // ──────────────────────────────────────────────────────────────

    /**
     * Save gate checkpoint data so records can be recovered on resume.
     */
    private saveGateCheckpoint(
        stepKey: string,
        config: GateStepConfig,
        records: RecordObject[],
        executorCtx: ExecutorContext,
    ): void {
        if (!executorCtx.cpData) {
            executorCtx.cpData = {};
        }
        executorCtx.cpData[`__gate:${stepKey}`] = {
            stepKey,
            approvalType: config.approvalType,
            pendingRecordCount: records.length,
            pendingRecords: deepClone(records as unknown as JsonObject) as JsonValue,
            pausedAt: new Date().toISOString(),
        } as Record<string, JsonValue>;
        executorCtx.markCheckpointDirty();
    }

    /**
     * Save timeout expiry to checkpoint for the background timeout checker.
     */
    private saveTimeoutToCheckpoint(
        stepKey: string,
        expiresAt: string,
        executorCtx: ExecutorContext,
    ): void {
        if (!executorCtx.cpData) {
            executorCtx.cpData = {};
        }
        executorCtx.cpData[`__gateTimeout:${stepKey}`] = {
            stepKey,
            expiresAt,
            createdAt: new Date().toISOString(),
        } as Record<string, JsonValue>;
        executorCtx.markCheckpointDirty();
    }
}
