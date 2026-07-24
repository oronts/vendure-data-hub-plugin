import type { PipelineRun } from './pipeline-run.entity';

export const CLEARED_PIPELINE_RUN_GATE_STATE = {
    gateStepKey: null,
    gateTimeoutAt: null,
    gateTimeoutLeaseToken: null,
    gateTimeoutLeaseExpiresAt: null,
} as const;

export function clearPipelineRunGateState(run: PipelineRun): void {
    Object.assign(run, CLEARED_PIPELINE_RUN_GATE_STATE);
}
