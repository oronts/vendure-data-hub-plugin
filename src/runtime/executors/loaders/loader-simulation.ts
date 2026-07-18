import { LoadStrategy } from '../../../constants/enums';
import { IMPACT_ANALYSIS } from '../../../constants/defaults/runtime-defaults';
import type { JsonObject, JsonValue } from '../../../types';
import type { RecordObject } from '../../executor-types';
import type {
    LoaderSimulationOperation,
    LoaderSimulationRecordDetail,
} from './types';

const RECORD_ID_FIELDS = [
    'id',
    '_id',
    'ID',
    'Id',
    'sku',
    'code',
    'uuid',
    'externalId',
    'slug',
    'email',
    'emailAddress',
] as const;

const SIMULATION_SCOPE_WARNING =
    'Proposed state reflects loader input; Vendure normalization and side effects are not executed';

interface UpsertSimulationInput {
    record: RecordObject;
    index: number;
    entityType: string;
    existing: unknown;
    strategy?: LoadStrategy;
    skipDuplicates?: boolean;
    identifier?: string;
    missingIdentifier?: string;
}

export function createUpsertSimulationDetail(
    input: UpsertSimulationInput,
): LoaderSimulationRecordDetail {
    const currentState = toSimulationObject(input.existing);
    const proposedState = toSimulationObject(input.record) ?? {};
    const recordId = input.identifier
        ?? getSimulationRecordId(input.record)
        ?? `${input.entityType.toLowerCase()}-${input.index + 1}`;

    if (input.missingIdentifier) {
        return createSimulationDetail({
            recordId,
            entityType: input.entityType,
            operation: 'ERROR',
            currentState,
            proposedState,
            validationErrors: [input.missingIdentifier],
        });
    }

    const strategy = input.strategy ?? LoadStrategy.UPSERT;
    if (currentState && strategy === LoadStrategy.CREATE) {
        const message = `${input.entityType} ${recordId} already exists`;
        return createSimulationDetail({
            recordId,
            entityType: input.entityType,
            operation: input.skipDuplicates ? 'SKIP' : 'ERROR',
            currentState,
            proposedState,
            validationErrors: input.skipDuplicates ? [] : [message],
            warnings: input.skipDuplicates ? [message] : [],
        });
    }

    if (!currentState && strategy === LoadStrategy.UPDATE) {
        return createSimulationDetail({
            recordId,
            entityType: input.entityType,
            operation: 'ERROR',
            currentState: null,
            proposedState,
            validationErrors: [`${input.entityType} ${recordId} was not found for update`],
        });
    }

    return createSimulationDetail({
        recordId,
        entityType: input.entityType,
        operation: currentState ? 'UPDATE' : 'CREATE',
        currentState,
        proposedState,
    });
}

export function createSimulationDetail(input: {
    recordId: string;
    entityType: string;
    operation: LoaderSimulationOperation;
    currentState?: JsonObject | null;
    proposedState: JsonObject;
    validationErrors?: string[];
    warnings?: string[];
}): LoaderSimulationRecordDetail {
    return {
        recordId: input.recordId,
        entityType: input.entityType,
        operation: input.operation,
        currentState: input.currentState ?? null,
        proposedState: input.proposedState,
        validationErrors: input.validationErrors ?? [],
        warnings: [
            ...(input.warnings ?? []),
            SIMULATION_SCOPE_WARNING,
        ],
    };
}

export function getSimulationRecordId(record: RecordObject): string | null {
    for (const field of RECORD_ID_FIELDS) {
        const value = record[field];
        if (value !== undefined && value !== null && value !== '') {
            return String(value);
        }
    }
    return null;
}

export function summarizeSimulationDetails(
    details: readonly LoaderSimulationRecordDetail[],
): Record<string, number> {
    return {
        wouldCreate: countOperation(details, 'CREATE'),
        wouldUpdate: countOperation(details, 'UPDATE'),
        wouldDelete: countOperation(details, 'DELETE'),
        wouldSkip: countOperation(details, 'SKIP'),
        wouldFail: countOperation(details, 'ERROR'),
    };
}

function countOperation(
    details: readonly LoaderSimulationRecordDetail[],
    operation: LoaderSimulationOperation,
): number {
    return details.filter(detail => detail.operation === operation).length;
}

export function toSimulationObject(value: unknown): JsonObject | null {
    const normalized = toSimulationValue(value, 0, new WeakSet<object>());
    return normalized && typeof normalized === 'object' && !Array.isArray(normalized)
        ? normalized
        : null;
}

function toSimulationValue(
    value: unknown,
    depth: number,
    seen: WeakSet<object>,
): JsonValue | undefined {
    if (value === null) return null;
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value !== 'object') return undefined;
    if (depth >= IMPACT_ANALYSIS.SNAPSHOT_MAX_DEPTH || seen.has(value)) return undefined;

    seen.add(value);
    if (Array.isArray(value)) {
        const result = value
            .slice(0, IMPACT_ANALYSIS.SNAPSHOT_MAX_ARRAY_ITEMS)
            .map(item => toSimulationValue(item, depth + 1, seen))
            .filter((item): item is JsonValue => item !== undefined);
        seen.delete(value);
        return result;
    }

    const result: JsonObject = {};
    for (const [key, item] of Object.entries(value).slice(
        0,
        IMPACT_ANALYSIS.SNAPSHOT_MAX_OBJECT_KEYS,
    )) {
        const normalized = toSimulationValue(item, depth + 1, seen);
        if (normalized !== undefined) result[key] = normalized;
    }
    seen.delete(value);
    return result;
}
