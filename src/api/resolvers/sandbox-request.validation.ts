import type { ID } from '@vendure/core';
import { SANDBOX } from '../../constants';
import { normalizeDryRunRecordLimit } from '../../runtime/helpers/dry-run-options';

export function revisionsBelongToPipeline(
    pipelineId: ID,
    revisionPipelineIds: readonly ID[],
): boolean {
    const expectedPipelineId = String(pipelineId);
    return revisionPipelineIds.every(id => String(id) === expectedPipelineId);
}

export function resolveLineageRecordLimit(
    recordIndex: number,
    requestedLimit?: number,
): number {
    if (
        !Number.isSafeInteger(recordIndex)
        || recordIndex < 0
        || recordIndex >= SANDBOX.MAX_RECORDS
    ) {
        throw new Error(
            `recordIndex must be an integer from 0 to ${SANDBOX.MAX_RECORDS - 1}`,
        );
    }
    return Math.max(
        normalizeDryRunRecordLimit(requestedLimit),
        recordIndex + 1,
    );
}
