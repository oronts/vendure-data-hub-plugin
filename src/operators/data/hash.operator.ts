import { AdapterDefinition, JsonObject, AdapterOperatorHelpers, OperatorResult } from '../types';
import { HashOperatorConfig } from './types';
import { applyHash } from './helpers';

/**
 * Operator definition for generating cryptographic hashes of field values.
 */
export const HASH_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'hash',
    description: 'Generate a cryptographic hash (MD5, SHA1, SHA256, SHA512) of field value(s).',
    pure: true,
    schema: {
        fields: [
            {
                key: 'source',
                label: 'Source field path(s)',
                type: 'json',
                required: true,
                description: 'Single path string or array of paths to hash together',
            },
            {
                key: 'target',
                label: 'Target field path',
                type: 'string',
                required: true,
                description: 'Path where the hash will be stored',
            },
            {
                key: 'algorithm',
                label: 'Hash algorithm',
                type: 'select',
                options: [
                    { value: 'md5', label: 'MD5' },
                    { value: 'sha1', label: 'SHA-1' },
                    { value: 'sha256', label: 'SHA-256' },
                    { value: 'sha512', label: 'SHA-512' },
                ],
                description: 'Default: sha256',
            },
            {
                key: 'encoding',
                label: 'Output encoding',
                type: 'select',
                options: [
                    { value: 'hex', label: 'Hexadecimal' },
                    { value: 'base64', label: 'Base64' },
                ],
                description: 'Default: hex',
            },
        ],
    },
};

/**
 * Apply hash operator to a single record.
 */
export function applyHashOperator(
    record: JsonObject,
    config: HashOperatorConfig,
): JsonObject {
    if (!config.source || !config.target) {
        return record;
    }
    return applyHash(record, config.source, config.target, config.algorithm, config.encoding);
}

/**
 * Generate cryptographic hash of field values.
 */
export function hashOperator(
    records: readonly JsonObject[],
    config: HashOperatorConfig,
    _helpers: AdapterOperatorHelpers,
): OperatorResult {
    if (!config.source || !config.target) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyHash(
            record,
            config.source,
            config.target,
            config.algorithm,
            config.encoding,
        ),
    );
    return { records: results };
}
