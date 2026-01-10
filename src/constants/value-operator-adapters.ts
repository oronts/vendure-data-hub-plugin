/**
 * Value operator adapter definitions - Coalesce, default, copy, hash, uuid operations
 */
import { AdapterDefinition } from '../sdk/types';

export const VALUE_OPERATOR_ADAPTERS: AdapterDefinition[] = [
    {
        type: 'operator',
        code: 'coalesce',
        description: 'Return the first non-null value from a list of field paths.',
        pure: true,
        schema: {
            fields: [
                { key: 'sources', label: 'Source field paths (JSON array)', type: 'json', required: true, description: 'Array of field paths to check in order' },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
                { key: 'default', label: 'Default value (JSON)', type: 'json', description: 'Value if all sources are null/undefined' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'hash',
        description: 'Generate a cryptographic hash (MD5, SHA1, SHA256, SHA512) of field value(s).',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path(s)', type: 'json', required: true, description: 'Single path string or array of paths to hash together' },
                { key: 'target', label: 'Target field path', type: 'string', required: true, description: 'Path where the hash will be stored' },
                { key: 'algorithm', label: 'Hash algorithm', type: 'select', options: [
                    { value: 'md5', label: 'MD5' },
                    { value: 'sha1', label: 'SHA-1' },
                    { value: 'sha256', label: 'SHA-256' },
                    { value: 'sha512', label: 'SHA-512' },
                ], description: 'Default: sha256' },
                { key: 'encoding', label: 'Output encoding', type: 'select', options: [
                    { value: 'hex', label: 'Hexadecimal' },
                    { value: 'base64', label: 'Base64' },
                ], description: 'Default: hex' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'uuid',
        description: 'Generate a UUID for each record. Supports v4 (random) and v5 (namespace-based deterministic).',
        pure: false, // v4 is not deterministic
        schema: {
            fields: [
                { key: 'target', label: 'Target field path', type: 'string', required: true, description: 'Path where the UUID will be stored' },
                { key: 'version', label: 'UUID version', type: 'select', options: [
                    { value: 'v4', label: 'v4 (Random)' },
                    { value: 'v5', label: 'v5 (Namespace-based)' },
                ], description: 'Default: v4' },
                { key: 'namespace', label: 'Namespace', type: 'string', description: 'For v5: UUID namespace or well-known name (dns, url, oid, x500)' },
                { key: 'source', label: 'Source field path', type: 'string', description: 'For v5: Field path containing the name to hash' },
            ],
        },
    },
    {
        type: 'operator',
        code: 'default',
        description: 'Set a default value if field is null or undefined.',
        pure: true,
        schema: {
            fields: [
                { key: 'path', label: 'Field path', type: 'string', required: true },
                { key: 'value', label: 'Default value (JSON)', type: 'json', required: true },
            ],
        },
    },
    {
        type: 'operator',
        code: 'copy',
        description: 'Copy a field value to another path.',
        pure: true,
        schema: {
            fields: [
                { key: 'source', label: 'Source field path', type: 'string', required: true },
                { key: 'target', label: 'Target field path', type: 'string', required: true },
            ],
        },
    },
];
