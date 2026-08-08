import { GATE_LIMITS, TIME } from '../../constants';
import { StepType } from '../../constants/enums';
import type { PipelineDefinition, PipelineMetrics } from '../../types';

export interface PausedGateMetadata {
    stepKey: string;
    timeoutAt: Date | null;
}

export function getPausedGateMetadata(
    metrics: PipelineMetrics,
    definition: PipelineDefinition,
    now: Date = new Date(),
): PausedGateMetadata | null {
    const stepKey = typeof metrics.pausedAtStep === 'string'
        ? metrics.pausedAtStep
        : null;
    if (!stepKey) return null;

    const step = definition.steps.find(candidate => candidate.key === stepKey);
    if (step?.type !== StepType.GATE) return null;

    const approvalType = step.config?.['approvalType'];
    const timeoutSeconds = step.config?.['timeoutSeconds'];
    if (
        approvalType !== 'TIMEOUT'
        || typeof timeoutSeconds !== 'number'
        || !Number.isSafeInteger(timeoutSeconds)
        || timeoutSeconds < GATE_LIMITS.MIN_TIMEOUT_SECONDS
        || timeoutSeconds > GATE_LIMITS.MAX_TIMEOUT_SECONDS
    ) {
        return { stepKey, timeoutAt: null };
    }

    return {
        stepKey,
        timeoutAt: new Date(now.getTime() + timeoutSeconds * TIME.SECOND),
    };
}
