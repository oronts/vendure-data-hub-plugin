import { createHash, randomUUID } from 'crypto';
import { JsonObject, JsonValue } from '../types';
import { getNestedValue, setNestedValue, removeNestedValue, deepClone } from '../helpers';
import { TemplateOperatorConfig, HashAlgorithm } from './types';

export function applyMapping(
    record: JsonObject,
    mapping: Record<string, string>,
    passthrough = false,
): JsonObject {
    const result: JsonObject = passthrough ? deepClone(record) : {};

    for (const [target, source] of Object.entries(mapping)) {
        const value = getNestedValue(record, source);
        if (value !== undefined) {
            setNestedValue(result, target, value);
        }
    }

    return result;
}

export function applyTemplate(
    record: JsonObject,
    config: TemplateOperatorConfig,
): JsonObject {
    const result = deepClone(record);

    // Create a modified interpolation that handles missing values
    const value = config.template.replace(/\$\{([^}]+)\}/g, (_, path) => {
        const fieldValue = getNestedValue(record, path);
        if (fieldValue === undefined || fieldValue === null) {
            if (config.missingAsEmpty) {
                return '';
            }
            return `\${${path}}`; // Keep placeholder if not found
        }
        return String(fieldValue);
    });

    setNestedValue(result, config.target, value);
    return result;
}

export function applySet(
    record: JsonObject,
    path: string,
    value: JsonValue,
): JsonObject {
    const result = deepClone(record);
    setNestedValue(result, path, value);
    return result;
}

export function applyRemove(
    record: JsonObject,
    path: string,
): JsonObject {
    const result = deepClone(record);
    removeNestedValue(result, path);
    return result;
}

export function applyRename(
    record: JsonObject,
    from: string,
    to: string,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(result, from);
    if (value !== undefined) {
        setNestedValue(result, to, value);
        removeNestedValue(result, from);
    }
    return result;
}

export function applyCopy(
    record: JsonObject,
    source: string,
    target: string,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(result, source);
    if (value !== undefined) {
        setNestedValue(result, target, deepClone(value));
    }
    return result;
}

/**
 * Generate a cryptographic hash of field value(s).
 */
export function applyHash(
    record: JsonObject,
    source: string | string[],
    target: string,
    algorithm: HashAlgorithm = 'sha256',
    encoding: 'hex' | 'base64' = 'hex',
): JsonObject {
    const result = deepClone(record);

    // Get values to hash
    const sources = Array.isArray(source) ? source : [source];
    const values: JsonValue[] = [];

    for (const path of sources) {
        const value = getNestedValue(record, path);
        if (value !== undefined) {
            values.push(value);
        }
    }

    if (values.length === 0) {
        setNestedValue(result, target, null);
        return result;
    }

    try {
        // Serialize values to string for hashing
        const dataToHash = JSON.stringify(values.length === 1 ? values[0] : values);
        const hash = createHash(algorithm);
        hash.update(dataToHash);
        const hashValue = hash.digest(encoding);
        setNestedValue(result, target, hashValue);
    } catch {
        // Invalid algorithm or encoding - leave target unchanged
        setNestedValue(result, target, null);
    }

    return result;
}

/**
 * Well-known namespace UUIDs for v5 UUID generation.
 */
const UUID_NAMESPACES: Record<string, string> = {
    dns: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    url: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
    oid: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
    x500: '6ba7b814-9dad-11d1-80b4-00c04fd430c8',
};

/**
 * Generate a v5 UUID from namespace and name using SHA-1.
 * This is a simplified implementation following RFC 4122.
 */
function generateUuidV5(namespace: string, name: string): string {
    // Resolve well-known namespace or use as-is
    const namespaceUuid = UUID_NAMESPACES[namespace.toLowerCase()] || namespace;

    // Parse namespace UUID to bytes
    const namespaceBytes = namespaceUuid.replace(/-/g, '');
    if (namespaceBytes.length !== 32) {
        throw new Error('Invalid namespace UUID');
    }

    const nsBuffer = Buffer.from(namespaceBytes, 'hex');
    const nameBuffer = Buffer.from(name, 'utf8');

    // Concatenate namespace and name
    const combined = Buffer.concat([nsBuffer, nameBuffer]);

    // Hash with SHA-1
    const hash = createHash('sha1').update(combined).digest();

    // Set version (5) and variant bits per RFC 4122
    hash[6] = (hash[6] & 0x0f) | 0x50; // Version 5
    hash[8] = (hash[8] & 0x3f) | 0x80; // Variant

    // Format as UUID string
    const hex = hash.subarray(0, 16).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Generate a UUID for the record.
 */
export function applyUuid(
    record: JsonObject,
    target: string,
    version: 'v4' | 'v5' = 'v4',
    namespace?: string,
    source?: string,
): JsonObject {
    const result = deepClone(record);

    try {
        let uuid: string;

        if (version === 'v5') {
            if (!namespace || !source) {
                setNestedValue(result, target, null);
                return result;
            }

            const name = getNestedValue(record, source);
            if (name === undefined || name === null) {
                setNestedValue(result, target, null);
                return result;
            }

            uuid = generateUuidV5(namespace, String(name));
        } else {
            // v4 - random UUID
            uuid = randomUUID();
        }

        setNestedValue(result, target, uuid);
    } catch {
        setNestedValue(result, target, null);
    }

    return result;
}
