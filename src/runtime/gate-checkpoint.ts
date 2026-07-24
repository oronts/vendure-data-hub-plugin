import type { ID } from '@vendure/core';

export interface GateCheckpointKeys {
    pending: string;
    approved: string;
}

export function getGateCheckpointKeys(
    runId: ID | undefined,
    stepKey: string,
): GateCheckpointKeys {
    const scope = runId === undefined ? 'sandbox' : String(runId);
    return {
        pending: `__gate:${scope}:${stepKey}`,
        approved: `__gateApproved:${scope}:${stepKey}`,
    };
}
