import type { IndividualRunMetrics, StepMetricsDetail } from '../../types';

const RUN_METRIC_FIELDS = new Set([
    'processed',
    'succeeded',
    'failed',
    'skipped',
    'sourceRecords',
    'durationMs',
    'details',
]);
const STEP_METRIC_FIELDS = new Set([
    'stepKey',
    'type',
    'adapterCode',
    'ok',
    'fail',
    'skipped',
    'durationMs',
    'counters',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function normalizeStepMetrics(value: unknown): StepMetricsDetail | undefined {
    if (!isRecord(value)) return undefined;

    const normalized: StepMetricsDetail = {};
    for (const [key, fieldValue] of Object.entries(value)) {
        if (!STEP_METRIC_FIELDS.has(key)) normalized[key] = fieldValue;
    }
    normalized.stepKey = stringValue(value.stepKey);
    normalized.type = stringValue(value.type);
    normalized.adapterCode = stringValue(value.adapterCode);
    normalized.ok = finiteNumber(value.ok);
    normalized.fail = finiteNumber(value.fail);
    normalized.skipped = finiteNumber(value.skipped);
    normalized.durationMs = finiteNumber(value.durationMs);
    if (isRecord(value.counters)) {
        const counters: Record<string, number> = {};
        for (const [key, fieldValue] of Object.entries(value.counters)) {
            const count = finiteNumber(fieldValue);
            if (count !== undefined) counters[key] = count;
        }
        normalized.counters = counters;
    }
    return normalized;
}

export function normalizeRunMetrics(value: unknown): IndividualRunMetrics | undefined {
    if (!isRecord(value)) return undefined;

    const normalized: IndividualRunMetrics = {};
    for (const [key, fieldValue] of Object.entries(value)) {
        if (!RUN_METRIC_FIELDS.has(key)) normalized[key] = fieldValue;
    }
    normalized.processed = finiteNumber(value.processed);
    normalized.succeeded = finiteNumber(value.succeeded);
    normalized.failed = finiteNumber(value.failed);
    normalized.skipped = finiteNumber(value.skipped);
    normalized.sourceRecords = finiteNumber(value.sourceRecords);
    normalized.durationMs = finiteNumber(value.durationMs);
    normalized.details = Array.isArray(value.details)
        ? value.details.flatMap(item => {
              const detail = normalizeStepMetrics(item);
              return detail ? [detail] : [];
          })
        : undefined;
    return normalized;
}
