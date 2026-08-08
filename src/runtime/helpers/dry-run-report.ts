import type {
    DryRunRecordError,
    JsonObject,
    PipelineMetrics,
} from '../../types';
import type { RecordObject } from '../executor-types';

export function buildDryRunReport(
    processed: number,
    details: JsonObject[],
    sampleRecords: Array<{
        step: string;
        before: RecordObject;
        after: RecordObject;
    }>,
    errors: DryRunRecordError[],
): {
    metrics: PipelineMetrics;
    sampleRecords: Array<{
        step: string;
        before: RecordObject;
        after: RecordObject;
    }>;
    errors?: DryRunRecordError[];
} {
    const rawSkipped = details.reduce((total, detail) => {
        const sideEffectSkips = detail['simulation'] === 'SKIPPED'
            && typeof detail['recordsIn'] === 'number'
            ? detail['recordsIn']
            : 0;
        const recordSkips = typeof detail['wouldSkip'] === 'number'
            ? detail['wouldSkip']
            : 0;
        return total + sideEffectSkips + recordSkips;
    }, 0);
    const simulatedFailures = details.reduce(
        (total, detail) => total + (
            typeof detail['wouldFail'] === 'number' ? detail['wouldFail'] : 0
        ),
        0,
    );
    const failed = Math.min(errors.length + simulatedFailures, processed);
    const skipped = Math.min(rawSkipped, Math.max(0, processed - failed));
    const succeeded = Math.max(0, processed - failed - skipped);

    return {
        metrics: {
            totalRecords: processed,
            processed,
            succeeded,
            failed,
            skipped,
            recordsProcessed: processed,
            recordsSucceeded: succeeded,
            recordsFailed: failed,
            recordsSkipped: skipped,
            durationMs: 0,
            details,
        },
        sampleRecords,
        errors: errors.length > 0 ? errors : undefined,
    };
}
