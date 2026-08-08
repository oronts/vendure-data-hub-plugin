import { PIPELINE_RETRY, THROUGHPUT_LIMITS } from '../../../shared/constants';
import { PARALLEL_EXECUTION } from '../../constants/defaults/runtime-defaults';
import { FIELD_LIMITS } from '../../constants/validation';
import { DrainStrategy } from '../../constants/enums';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';

const SUPPORTED_DRAIN_STRATEGIES: ReadonlySet<string> = new Set(
    Object.values(DrainStrategy),
);

export function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateErrorHandling(
    value: unknown,
    issues: PipelineDefinitionIssue[],
    path: string,
): void {
    if (value === undefined) return;
    if (!isRecord(value)) {
        issues.push({
            message: `${path} must be an object`,
            errorCode: 'context-invalid',
            field: path,
        });
        return;
    }

    validateBoundedNumber(
        value.maxRetries,
        `${path}.maxRetries`,
        0,
        PIPELINE_RETRY.MAX_RETRIES,
        true,
        issues,
    );
    validateBoundedNumber(
        value.retryDelayMs,
        `${path}.retryDelayMs`,
        0,
        PIPELINE_RETRY.MAX_DELAY_MS,
        true,
        issues,
    );
    validateBoundedNumber(
        value.maxRetryDelayMs,
        `${path}.maxRetryDelayMs`,
        0,
        PIPELINE_RETRY.MAX_DELAY_MS,
        true,
        issues,
    );
    validateBoundedNumber(
        value.backoffMultiplier,
        `${path}.backoffMultiplier`,
        1,
        PIPELINE_RETRY.MAX_BACKOFF_MULTIPLIER,
        false,
        issues,
    );

    if (
        typeof value.retryDelayMs === 'number'
        && typeof value.maxRetryDelayMs === 'number'
        && Number.isFinite(value.retryDelayMs)
        && Number.isFinite(value.maxRetryDelayMs)
        && value.maxRetryDelayMs < value.retryDelayMs
    ) {
        issues.push({
            message: `${path}.maxRetryDelayMs must be greater than or equal to retryDelayMs`,
            errorCode: 'context-invalid',
            field: `${path}.maxRetryDelayMs`,
        });
    }
}

export function validateThroughput(
    value: unknown,
    path: string,
    issues: PipelineDefinitionIssue[],
    stepKey?: string,
): void {
    if (value === undefined) return;
    if (!isRecord(value)) {
        issues.push({
            message: `${path} must be an object`,
            errorCode: 'context-invalid',
            stepKey,
            field: path,
        });
        return;
    }

    validateBoundedNumber(
        value.rateLimitRps,
        `${path}.rateLimitRps`,
        THROUGHPUT_LIMITS.MIN_RATE_LIMIT_RPS,
        THROUGHPUT_LIMITS.MAX_RATE_LIMIT_RPS,
        false,
        issues,
        stepKey,
    );
    validateBoundedNumber(
        value.batchSize,
        `${path}.batchSize`,
        FIELD_LIMITS.BATCH_SIZE_MIN,
        FIELD_LIMITS.BATCH_SIZE_MAX,
        true,
        issues,
        stepKey,
    );
    validateBoundedNumber(
        value.concurrency,
        `${path}.concurrency`,
        PARALLEL_EXECUTION.MIN_CONCURRENT_STEPS,
        PARALLEL_EXECUTION.MAX_CONCURRENT_STEPS,
        true,
        issues,
        stepKey,
    );

    if (
        value.drainStrategy !== undefined
        && (
            typeof value.drainStrategy !== 'string'
            || !SUPPORTED_DRAIN_STRATEGIES.has(value.drainStrategy)
        )
    ) {
        issues.push({
            message: `${path}.drainStrategy must be BACKOFF, SHED, or QUEUE`,
            errorCode: 'context-invalid',
            stepKey,
            field: `${path}.drainStrategy`,
        });
    }

    if (value.pauseOnErrorRate === undefined) return;
    const pausePath = `${path}.pauseOnErrorRate`;
    if (!isRecord(value.pauseOnErrorRate)) {
        issues.push({
            message: `${pausePath} must be an object`,
            errorCode: 'context-invalid',
            stepKey,
            field: pausePath,
        });
        return;
    }
    const pause = value.pauseOnErrorRate;
    if (
        typeof pause.threshold !== 'number'
        || !Number.isFinite(pause.threshold)
        || pause.threshold <= 0
        || pause.threshold > 1
    ) {
        issues.push({
            message: `${pausePath}.threshold must be a finite number greater than 0 and less than or equal to 1`,
            errorCode: 'context-invalid',
            stepKey,
            field: `${pausePath}.threshold`,
        });
    }
    validateBoundedNumber(
        pause.intervalSec,
        `${pausePath}.intervalSec`,
        THROUGHPUT_LIMITS.MIN_PAUSE_INTERVAL_SEC,
        THROUGHPUT_LIMITS.MAX_PAUSE_INTERVAL_SEC,
        false,
        issues,
        stepKey,
    );
}

export function validateParallelExecution(
    value: unknown,
    issues: PipelineDefinitionIssue[],
    path: string,
): void {
    if (value === undefined) return;
    if (!isRecord(value)) {
        issues.push({
            message: `${path} must be an object`,
            errorCode: 'context-invalid',
            field: path,
        });
        return;
    }
    if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
        issues.push({
            message: `${path}.enabled must be a boolean`,
            errorCode: 'context-invalid',
            field: `${path}.enabled`,
        });
    }
    if (
        value.maxConcurrentSteps !== undefined
        && (
            !Number.isSafeInteger(value.maxConcurrentSteps)
            || (value.maxConcurrentSteps as number) < 1
            || (value.maxConcurrentSteps as number) > PARALLEL_EXECUTION.MAX_CONCURRENT_STEPS
        )
    ) {
        issues.push({
            message: `${path}.maxConcurrentSteps must be an integer from 1 to ${PARALLEL_EXECUTION.MAX_CONCURRENT_STEPS}`,
            errorCode: 'context-invalid',
            field: `${path}.maxConcurrentSteps`,
        });
    }
    if (
        value.errorPolicy !== undefined
        && !PARALLEL_EXECUTION.ERROR_POLICIES.some(
            policy => policy === value.errorPolicy,
        )
    ) {
        issues.push({
            message: `${path}.errorPolicy must be FAIL_FAST, CONTINUE, or BEST_EFFORT`,
            errorCode: 'context-invalid',
            field: `${path}.errorPolicy`,
        });
    }
}

function validateBoundedNumber(
    value: unknown,
    field: string,
    minimum: number,
    maximum: number,
    integer: boolean,
    issues: PipelineDefinitionIssue[],
    stepKey?: string,
): void {
    if (value === undefined) return;
    if (
        typeof value !== 'number'
        || !Number.isFinite(value)
        || value < minimum
        || value > maximum
        || (integer && !Number.isSafeInteger(value))
    ) {
        issues.push({
            message: `${field} must be ${integer ? 'an integer' : 'a finite number'} from ${minimum} to ${maximum}`,
            errorCode: 'context-invalid',
            stepKey,
            field,
        });
    }
}
