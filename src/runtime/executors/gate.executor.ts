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

import { Injectable, Inject } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import * as nodemailer from 'nodemailer';
import { PipelineStepDefinition, PipelineContext, JsonValue, JsonObject } from '../../types/index';
import type { DataHubPluginOptions } from '../../types/index';
import { RecordObject, ExecutorContext } from '../executor-types';
import {
    CONTENT_TYPES,
    DATAHUB_PLUGIN_OPTIONS,
    GATE_LIMITS,
    HTTP,
    HTTP_HEADERS,
    LOGGER_CONTEXTS,
} from '../../constants/index';
import { secureFetch } from '../../utils/secure-fetch.utils';
import { getErrorMessage } from '../../utils/error.utils';
import { deepClone } from '../../utils/object-path.utils';
import { DomainEventsService } from '../../services/events/domain-events.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { getGateCheckpointKeys } from '../gate-checkpoint';

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

function resolvePreviewCount(config: GateStepConfig): number {
    const previewCount = config.previewCount ?? GATE_LIMITS.DEFAULT_PREVIEW_COUNT;
    if (
        !Number.isSafeInteger(previewCount)
        || previewCount < 1
        || previewCount > GATE_LIMITS.MAX_PREVIEW_COUNT
    ) {
        throw new Error(
            `GATE previewCount must be an integer between 1 and ${GATE_LIMITS.MAX_PREVIEW_COUNT}`,
        );
    }
    return previewCount;
}

function assertExecutableGateConfig(config: GateStepConfig): void {
    if (config.approvalType === 'MANUAL') return;
    if (config.approvalType === 'THRESHOLD') {
        const threshold = config.errorThresholdPercent;
        if (
            typeof threshold !== 'number'
            || !Number.isFinite(threshold)
            || threshold < 0
            || threshold > 100
        ) {
            throw new Error('GATE errorThresholdPercent must be between 0 and 100');
        }
        return;
    }
    if (config.approvalType === 'TIMEOUT') {
        const timeoutSeconds = config.timeoutSeconds;
        if (
            typeof timeoutSeconds !== 'number'
            || !Number.isSafeInteger(timeoutSeconds)
            || timeoutSeconds < GATE_LIMITS.MIN_TIMEOUT_SECONDS
            || timeoutSeconds > GATE_LIMITS.MAX_TIMEOUT_SECONDS
        ) {
            throw new Error(
                `GATE timeoutSeconds must be an integer between ${GATE_LIMITS.MIN_TIMEOUT_SECONDS} and ${GATE_LIMITS.MAX_TIMEOUT_SECONDS}`,
            );
        }
        return;
    }
    throw new Error(`Unsupported GATE approval type: ${String(config.approvalType)}`);
}

@Injectable()
export class GateExecutor {
    private readonly logger: DataHubLogger;

    constructor(
        @Inject(DATAHUB_PLUGIN_OPTIONS) private options: DataHubPluginOptions,
        private domainEvents: DomainEventsService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.GATE_EXECUTOR);
    }

    /**
     * Execute a GATE step.
     *
     * Captures the input records and returns a GateResult indicating whether
     * the pipeline should pause for approval or auto-approve and continue.
     *
     * Auto-approve conditions:
     * - THRESHOLD mode: auto-approves when the current error rate is below the
     *   configured threshold.
     *
     * For MANUAL mode the pipeline always pauses.
     *
     * TIMEOUT mode pauses the pipeline. The runner persists the selected gate's
     * deadline for bounded background processing.
     */
    async execute(
        _ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        executorCtx: ExecutorContext,
        _pipelineContext?: PipelineContext,
    ): Promise<GateResult> {
        const config = (step.config ?? {}) as unknown as GateStepConfig;
        assertExecutableGateConfig(config);
        const previewCount = resolvePreviewCount(config);

        // Check if gate was already approved (resuming after gate approval)
        const gateKeys = getGateCheckpointKeys(executorCtx.runId, step.key);
        const approvalKey = gateKeys.approved;
        if (executorCtx.cpData?.[approvalKey]) {
            this.logger.info(`GATE step "${step.key}": already approved, continuing pipeline`);
            // Recover saved records from gate checkpoint. Avoids returning empty input
            // when an exhausted file extractor produces 0 records on resume.
            const gateKey = gateKeys.pending;
            const gateData = executorCtx.cpData[gateKey] as { pendingRecords?: JsonValue } | undefined;
            const savedRecords = Array.isArray(gateData?.pendingRecords)
                ? (gateData!.pendingRecords as unknown as RecordObject[])
                : input;
            delete executorCtx.cpData[approvalKey];
            delete executorCtx.cpData[gateKey];
            executorCtx.markCheckpointDirty();
            return {
                paused: false,
                pendingRecords: savedRecords,
                previewRecords: savedRecords.slice(0, previewCount),
                stepKey: step.key,
                config,
            };
        }

        // --- THRESHOLD mode ---
        if (config.approvalType === 'THRESHOLD') {
            const shouldAutoApprove = this.evaluateThreshold(config, executorCtx);
            if (shouldAutoApprove) {
                this.logger.info(`GATE step "${step.key}": THRESHOLD auto-approved (error rate below threshold or no errors)`);
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
                this.logger.warn(`GATE "${stepKey}": webhook notification failed: ${getErrorMessage(err)}`),
            );
        }
        if (config.notifyEmail) {
            this.sendEmailNotification(config.notifyEmail, stepKey, config, records).catch(err =>
                this.logger.warn(`GATE "${stepKey}": email notification failed: ${getErrorMessage(err)}`),
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

        const previewCount = config.previewCount ?? GATE_LIMITS.DEFAULT_PREVIEW_COUNT;
        const payload = {
            event: 'gate.reached',
            stepKey,
            approvalType: config.approvalType,
            recordCount: records.length,
            previewRecords: records.slice(0, previewCount),
            timestamp: new Date().toISOString(),
        };

        const response = await secureFetch(url, {
            method: 'POST',
            headers: { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(HTTP.TIMEOUT_MS),
        });

        await response.body?.cancel().catch(() => undefined);
        this.logger.info(`GATE "${stepKey}": webhook notification sent (status=${response.status})`);
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
            this.logger.warn(
                `GATE "${stepKey}": email notification skipped - ` +
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

        const previewCount = config.previewCount ?? GATE_LIMITS.DEFAULT_PREVIEW_COUNT;
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

            this.logger.info(`GATE "${stepKey}": email notification sent to ${email}`);
        } finally {
            transporter.close();
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
     * If no error stats are available, returns false so the gate pauses.
     */
    private evaluateThreshold(config: GateStepConfig, executorCtx: ExecutorContext): boolean {
        const threshold = config.errorThresholdPercent;
        if (typeof threshold !== 'number') {
            throw new Error('GATE errorThresholdPercent is required for THRESHOLD approval');
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
        this.logger.info(
            `GATE THRESHOLD evaluation: errorRate=${errorRate.toFixed(2)}%, ` +
            `threshold=${threshold}%, ` +
            `errors=${errorCount}, successes=${successCount}`,
        );

        return errorRate < threshold;
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
        const key = getGateCheckpointKeys(executorCtx.runId, stepKey).pending;
        executorCtx.cpData[key] = {
            runId: executorCtx.runId == null ? 'sandbox' : String(executorCtx.runId),
            stepKey,
            approvalType: config.approvalType,
            pendingRecordCount: records.length,
            pendingRecords: deepClone(records as unknown as JsonObject) as JsonValue,
            pausedAt: new Date().toISOString(),
        } as Record<string, JsonValue>;
        executorCtx.markCheckpointDirty();
    }

}
