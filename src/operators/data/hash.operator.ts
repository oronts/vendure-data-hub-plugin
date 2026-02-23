import { AdapterDefinition, JsonObject } from '../types';
import { HashOperatorConfig } from './types';
import { applyHash } from './helpers';
import { createRecordOperator } from '../operator-factory';
import { HASH_ALGORITHM_OPTIONS, HASH_ENCODING_OPTIONS } from '../../constants/adapter-schema-options';

/**
 * Operator definition for generating cryptographic hashes of field values.
 */
export const HASH_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'hash',
    description: 'Generate a cryptographic hash (MD5, SHA1, SHA256, SHA512) of field value(s).',
    category: 'DATA',
    categoryLabel: 'Data',
    categoryOrder: 0,
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
                options: HASH_ALGORITHM_OPTIONS,
                description: 'Default: sha256',
            },
            {
                key: 'encoding',
                label: 'Output encoding',
                type: 'select',
                options: HASH_ENCODING_OPTIONS,
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

export const hashOperator = createRecordOperator(applyHashOperator);
