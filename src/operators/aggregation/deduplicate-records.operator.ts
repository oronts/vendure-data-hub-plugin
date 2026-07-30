import { getNestedValue } from '../helpers';
import type {
    AdapterDefinition,
    AdapterOperatorHelpers,
    JsonObject,
    JsonValue,
    OperatorResult,
} from '../types';
import type {
    DeduplicateRecordsOperatorConfig,
    DeduplicateRecordsStrategy,
} from './types';

const DEDUPLICATE_STRATEGIES = ['FIRST', 'LAST', 'LOWEST', 'HIGHEST'] as const;

export const DEDUPLICATE_RECORDS_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'deduplicateRecords',
    description: 'Deduplicate a record batch by a scalar key with deterministic conflict resolution.',
    category: 'AGGREGATION',
    categoryLabel: 'Aggregation',
    categoryOrder: 6,
    pure: false,
    schema: {
        fields: [
            { key: 'key', label: 'Record key field path', type: 'string', required: true },
            {
                key: 'keep',
                label: 'Record to keep',
                type: 'select',
                defaultValue: 'FIRST',
                options: DEDUPLICATE_STRATEGIES.map(value => ({ value, label: value })),
            },
            {
                key: 'priority',
                label: 'Numeric priority field path',
                type: 'string',
                description: 'Required when keeping the lowest or highest priority record',
            },
        ],
    },
};

function normalizeScalarKey(value: JsonValue | undefined): string | undefined {
    if (typeof value === 'string' || typeof value === 'boolean') {
        return `${typeof value}:${String(value)}`;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return `number:${value}`;
    }
    return undefined;
}

function shouldReplace(
    current: JsonObject,
    candidate: JsonObject,
    strategy: DeduplicateRecordsStrategy,
    priorityPath: string | undefined,
): boolean {
    if (strategy === 'FIRST') return false;
    if (strategy === 'LAST') return true;
    if (!priorityPath) {
        throw new Error(`deduplicateRecords priority is required for ${strategy}`);
    }

    const currentPriority = getNestedValue(current, priorityPath);
    const candidatePriority = getNestedValue(candidate, priorityPath);
    if (
        typeof currentPriority !== 'number'
        || !Number.isFinite(currentPriority)
        || typeof candidatePriority !== 'number'
        || !Number.isFinite(candidatePriority)
    ) {
        throw new Error('deduplicateRecords priority values must be finite numbers');
    }

    return strategy === 'LOWEST'
        ? candidatePriority < currentPriority
        : candidatePriority > currentPriority;
}

export function deduplicateRecordsOperator(
    records: readonly JsonObject[],
    config: DeduplicateRecordsOperatorConfig,
    _helpers: AdapterOperatorHelpers,
): OperatorResult {
    if (!config.key?.trim()) {
        throw new Error('deduplicateRecords key is required');
    }

    const strategy = config.keep ?? 'FIRST';
    if (!DEDUPLICATE_STRATEGIES.includes(strategy)) {
        throw new Error(`Unsupported deduplicateRecords strategy: ${String(strategy)}`);
    }

    const selected: JsonObject[] = [];
    const indexByKey = new Map<string, number>();

    for (const record of records) {
        const normalizedKey = normalizeScalarKey(getNestedValue(record, config.key));
        if (normalizedKey === undefined) {
            selected.push(record);
            continue;
        }

        const selectedIndex = indexByKey.get(normalizedKey);
        if (selectedIndex === undefined) {
            indexByKey.set(normalizedKey, selected.length);
            selected.push(record);
            continue;
        }

        if (shouldReplace(selected[selectedIndex], record, strategy, config.priority)) {
            selected[selectedIndex] = record;
        }
    }

    return { records: selected };
}
