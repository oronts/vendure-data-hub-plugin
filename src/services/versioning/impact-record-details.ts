import type {
    JsonObject,
    JsonValue,
    PipelineDefinition,
    PipelineMetrics,
    RecordDetail,
} from '../../types';
import type { SampleRecord } from './impact-collectors';
import { extractRecordId, inferEntityType } from './impact-collectors';
import { getAdapterCode } from '../../types/step-configs';
import { StepType } from '../../constants';

const OPERATIONS = new Set<RecordDetail['operation']>([
    'CREATE',
    'UPDATE',
    'DELETE',
    'SKIP',
    'ERROR',
]);

export function extractRecordDetails(metrics: PipelineMetrics): RecordDetail[] {
    const details = metrics.details;
    if (!Array.isArray(details)) return [];

    const records: RecordDetail[] = [];
    for (const stepDetail of details) {
        if (!isJsonObject(stepDetail) || !Array.isArray(stepDetail.recordDetails)) continue;
        for (const value of stepDetail.recordDetails) {
            const detail = parseRecordDetail(value);
            if (detail) records.push(detail);
        }
    }
    return records;
}

export function fillUnknownRecordDetails(
    requestedIds: readonly string[],
    knownDetails: readonly RecordDetail[],
    samples: readonly SampleRecord[],
    definition: PipelineDefinition,
): RecordDetail[] {
    const byId = new Map(knownDetails.map(detail => [detail.recordId, detail]));
    const samplesById = new Map<string, SampleRecord>();
    for (const sample of samples) {
        const id = extractRecordId(sample.after) ?? extractRecordId(sample.before);
        if (id) samplesById.set(id, sample);
    }
    const loadSteps = definition.steps.filter(step => step.type === StepType.LOAD);
    const entityType = loadSteps.length === 1
        ? inferEntityType(getAdapterCode(loadSteps[0]))
        : 'Entity';

    return requestedIds.map(recordId => {
        const known = byId.get(recordId);
        if (known) return known;
        const sample = samplesById.get(recordId);
        return {
            recordId,
            entityType,
            operation: 'UNKNOWN',
            currentState: null,
            proposedState: sample?.after ?? {},
            diff: null,
            validationErrors: [],
            warnings: [sample
                ? 'The target loader does not expose a per-record simulation decision'
                : 'The record was not present in the current dry-run sample'],
        };
    });
}

function parseRecordDetail(value: JsonValue): RecordDetail | null {
    if (!isJsonObject(value)) return null;
    const operation = typeof value.operation === 'string'
        && OPERATIONS.has(value.operation as RecordDetail['operation'])
        ? value.operation as RecordDetail['operation']
        : null;
    if (
        typeof value.recordId !== 'string'
        || typeof value.entityType !== 'string'
        || !operation
        || !isJsonObject(value.proposedState)
    ) {
        return null;
    }
    const currentState = isJsonObject(value.currentState) ? value.currentState : null;
    return {
        recordId: value.recordId,
        entityType: value.entityType,
        operation,
        currentState,
        proposedState: value.proposedState,
        diff: operation === 'UPDATE' && currentState
            ? buildRecordDiff(currentState, value.proposedState)
            : null,
        validationErrors: toStringArray(value.validationErrors),
        warnings: toStringArray(value.warnings),
    };
}

function buildRecordDiff(
    currentState: JsonObject,
    proposedState: JsonObject,
): Record<string, { before: unknown; after: unknown }> {
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of new Set([
        ...Object.keys(currentState),
        ...Object.keys(proposedState),
    ])) {
        const before = currentState[key] ?? null;
        const after = proposedState[key] ?? null;
        if (JSON.stringify(before) !== JSON.stringify(after)) {
            diff[key] = { before, after };
        }
    }
    return diff;
}

function toStringArray(value: JsonValue | undefined): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
