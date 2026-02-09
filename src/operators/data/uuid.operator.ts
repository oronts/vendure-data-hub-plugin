import { AdapterDefinition, JsonObject, OperatorHelpers, OperatorResult } from '../types';
import { UuidOperatorConfig } from './types';
import { applyUuid } from './helpers';

/**
 * Operator definition for generating UUIDs.
 */
export const UUID_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'uuid',
    description: 'Generate a UUID for each record. Supports v4 (random) and v5 (namespace-based deterministic).',
    pure: false, // v4 is not deterministic
    schema: {
        fields: [
            {
                key: 'target',
                label: 'Target field path',
                type: 'string',
                required: true,
                description: 'Path where the UUID will be stored',
            },
            {
                key: 'version',
                label: 'UUID version',
                type: 'select',
                options: [
                    { value: 'v4', label: 'v4 (Random)' },
                    { value: 'v5', label: 'v5 (Namespace-based)' },
                ],
                description: 'Default: v4',
            },
            {
                key: 'namespace',
                label: 'Namespace',
                type: 'string',
                description: 'For v5: UUID namespace or well-known name (dns, url, oid, x500)',
            },
            {
                key: 'source',
                label: 'Source field path',
                type: 'string',
                description: 'For v5: Field path containing the name to hash',
            },
        ],
    },
};

/**
 * Apply UUID operator to a single record.
 */
export function applyUuidOperator(
    record: JsonObject,
    config: UuidOperatorConfig,
): JsonObject {
    if (!config.target) {
        return record;
    }
    return applyUuid(record, config.target, config.version, config.namespace, config.source);
}

/**
 * Generate UUID for each record.
 */
export function uuidOperator(
    records: readonly JsonObject[],
    config: UuidOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult {
    if (!config.target) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyUuid(
            record,
            config.target,
            config.version,
            config.namespace,
            config.source,
        ),
    );
    return { records: results };
}
