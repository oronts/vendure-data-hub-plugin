import { isDeepStrictEqual } from 'node:util';
import { PipelineStatus } from '../../constants/enums';
import { FIELD_LIMITS } from '../../constants/validation';
import { PipelineDefinition } from '../../types';
import { isValidPipelineCode } from '../../utils/input-validation.utils';

const MIN_PIPELINE_VERSION = 1;

export interface RunnablePipeline {
    enabled: boolean;
    status: PipelineStatus;
}

export function assertValidPipelineCode(code: string): void {
    if (code.length > FIELD_LIMITS.CODE_MAX) {
        throw new Error(`Pipeline code must not exceed ${FIELD_LIMITS.CODE_MAX} characters`);
    }
    if (!isValidPipelineCode(code)) {
        throw new Error('Pipeline code must contain only lowercase letters, numbers, and hyphens');
    }
}

export function normalizePipelineVersion(value: unknown, fallback: number): number {
    if (value === undefined || value === null) {
        return fallback;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_PIPELINE_VERSION) {
        throw new Error(`Pipeline version must be an integer greater than or equal to ${MIN_PIPELINE_VERSION}`);
    }
    return value;
}

export function normalizePipelineDefinition(
    definition: PipelineDefinition,
    fallbackVersion: number,
): PipelineDefinition {
    const normalized = clonePipelineDefinition(definition);
    normalized.version = normalizePipelineVersion(normalized.version, fallbackVersion);
    return normalized;
}

export function clonePipelineDefinition(definition: PipelineDefinition): PipelineDefinition {
    return JSON.parse(JSON.stringify(definition)) as PipelineDefinition;
}

export function definitionsEqual(
    left: PipelineDefinition,
    right: PipelineDefinition,
): boolean {
    return isDeepStrictEqual(left, right);
}

export function statusAfterExecutableUpdate(
    currentStatus: PipelineStatus,
    executableChanged: boolean,
): PipelineStatus {
    if (!executableChanged || currentStatus === PipelineStatus.DRAFT) {
        return currentStatus;
    }
    return PipelineStatus.DRAFT;
}

export function assertPipelineStatus(
    currentStatus: PipelineStatus,
    allowedStatuses: readonly PipelineStatus[],
    action: string,
): void {
    if (allowedStatuses.includes(currentStatus)) {
        return;
    }
    throw new Error(
        `Cannot ${action} pipeline in ${currentStatus} status; expected ${allowedStatuses.join(' or ')}`,
    );
}

export function assertPipelineRunnable(pipeline: RunnablePipeline): void {
    assertPipelineStatus(
        pipeline.status,
        [PipelineStatus.PUBLISHED],
        'run',
    );
    if (!pipeline.enabled) {
        throw new Error('Pipeline is disabled');
    }
}
