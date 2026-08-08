import type { JsonObject } from '../../types';
import { StepType } from '../../types';

interface OutcomeMetrics {
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
    details: readonly JsonObject[];
    paused?: boolean;
    cancelled?: boolean;
}

const OUTCOME_STEP_TYPES: ReadonlySet<string> = new Set([
    StepType.LOAD,
    StepType.EXPORT,
    StepType.FEED,
    StepType.SINK,
]);

export function reconcileCompletionOutcomes(
    metrics: OutcomeMetrics,
    seededRecordCount: number = 0,
): void {
    if (
        metrics.paused
        || metrics.cancelled
        || metrics.details.some(detail => (
            typeof detail['type'] === 'string'
            && OUTCOME_STEP_TYPES.has(detail['type'])
        ))
    ) {
        return;
    }

    const extractionDetails = metrics.details.filter(
        detail => detail['type'] === StepType.EXTRACT,
    );
    const sourceAttempts = extractionDetails.length > 0
        ? extractionDetails.reduce(
            (total, detail) => total
                + nonNegativeCount(detail['out'])
                + nonNegativeCount(detail['failed']),
            0,
        )
        : seededRecordCount;
    metrics.succeeded = Math.max(
        0,
        sourceAttempts - metrics.failed - metrics.skipped,
    );
    metrics.processed = metrics.succeeded + metrics.failed + metrics.skipped;
}

function nonNegativeCount(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : 0;
}
