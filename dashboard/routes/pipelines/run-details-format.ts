import type { IndividualRunMetrics, StepMetricsDetail } from '../../types';

export interface RunSummaryMessage {
    readonly kind: 'SOURCE' | 'PROCESSED' | 'SUCCEEDED' | 'SKIPPED' | 'FAILED';
    readonly count: number;
}

function countMessage(
    kind: RunSummaryMessage['kind'],
    count: number,
): RunSummaryMessage {
    return { kind, count };
}

export function buildRunSummaryMessages(
    metrics: IndividualRunMetrics,
): RunSummaryMessage[] {
    const sourceRecords = Number(metrics.sourceRecords ?? 0);
    const processed = Number(metrics.processed ?? 0);
    const succeeded = Number(metrics.succeeded ?? 0);
    const skipped = Number(metrics.skipped ?? 0);
    const failed = Number(metrics.failed ?? 0);

    return [
        countMessage('SOURCE', sourceRecords),
        countMessage('PROCESSED', processed),
        countMessage('SUCCEEDED', succeeded),
        countMessage('SKIPPED', skipped),
        countMessage('FAILED', failed),
    ];
}

export function findPausedGateStep(
    metrics: IndividualRunMetrics,
): string | undefined {
    const details = metrics.details;
    if (!Array.isArray(details)) return undefined;

    const gateStep = details.find(
        (detail: StepMetricsDetail) =>
            detail.type === 'GATE'
            && (detail as Record<string, unknown>).paused === true,
    );
    return gateStep?.stepKey;
}
