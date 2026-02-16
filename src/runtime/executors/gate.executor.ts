/**
 * Gate Executor
 *
 * Handles GATE step execution for human-in-the-loop approval workflows.
 * When a pipeline reaches a GATE step, records are captured and the pipeline
 * pauses to await human approval (or auto-approves based on configuration).
 */

import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { PipelineStepDefinition, PipelineContext, JsonValue } from '../../types/index';
import { RecordObject, ExecutorContext } from '../executor-types';

const logger = new Logger('DataHub:GateExecutor');

/** Default number of records to include in the gate preview */
const DEFAULT_PREVIEW_COUNT = 10;

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
export class GateExecutor {
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
     * TIMEOUT mode: stores expiry in checkpoint but currently falls back to
     * MANUAL (background worker not yet implemented).
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

        // --- TIMEOUT mode ---
        // TODO: Add background worker to auto-approve TIMEOUT gates on expiry
        if (config.approvalType === 'TIMEOUT' && config.timeoutSeconds) {
            const expiresAt = new Date(Date.now() + config.timeoutSeconds * 1000).toISOString();
            this.saveTimeoutToCheckpoint(step.key, expiresAt, executorCtx);
            logger.warn(
                `GATE "${step.key}": TIMEOUT auto-approval not yet implemented ` +
                `(expires ${expiresAt}). Falling back to MANUAL pause.`,
            );
        }

        // --- Save checkpoint for paused gate ---
        this.saveGateCheckpoint(step.key, config, input, executorCtx);

        // --- Notifications (planned) ---
        // TODO: Dispatch webhook via HttpService
        if (config.notifyWebhook) {
            logger.warn(
                `GATE "${step.key}": Webhook notification not yet available (url: ${config.notifyWebhook})`,
            );
        }
        // TODO: Send email via mailer service
        if (config.notifyEmail) {
            logger.warn(
                `GATE "${step.key}": Email notification not yet available (to: ${config.notifyEmail})`,
            );
        }

        return {
            paused: true,
            pendingRecords: input,
            previewRecords: input.slice(0, previewCount),
            stepKey: step.key,
            config,
        };
    }

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
            pendingRecords: records as unknown as JsonValue,
            pausedAt: new Date().toISOString(),
        } as Record<string, JsonValue>;
        executorCtx.markCheckpointDirty();
    }

    /**
     * Save timeout expiry to checkpoint for future background worker consumption.
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
