import type { ID } from '@vendure/core';

export const GATE_TIMEOUT_PREFIX = '__gateTimeout:';

export interface GateCheckpointKeys {
    pending: string;
    approved: string;
    timeout: string;
}

export function getGateCheckpointKeys(
    runId: ID | undefined,
    stepKey: string,
): GateCheckpointKeys {
    const scope = runId === undefined ? 'sandbox' : String(runId);
    return {
        pending: `__gate:${scope}:${stepKey}`,
        approved: `__gateApproved:${scope}:${stepKey}`,
        timeout: `${GATE_TIMEOUT_PREFIX}${scope}:${stepKey}`,
    };
}
