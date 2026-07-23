import { SCHEMA_REGISTRY } from '../../constants';

const SCHEMA_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/;
const SCHEMA_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

export function isValidSchemaId(schemaId: unknown): schemaId is string {
    return typeof schemaId === 'string'
        && schemaId.trim() === schemaId
        && schemaId.length <= SCHEMA_REGISTRY.MAX_SCHEMA_ID_LENGTH
        && SCHEMA_ID_PATTERN.test(schemaId);
}

export function isValidSchemaVersion(version: unknown): version is string {
    return typeof version === 'string'
        && version.trim() === version
        && version.length <= SCHEMA_REGISTRY.MAX_VERSION_LENGTH
        && SCHEMA_VERSION_PATTERN.test(version);
}

export function assertSchemaId(schemaId: string): void {
    if (!isValidSchemaId(schemaId)) {
        throw new Error(
            'Schema IDs must start with a letter and contain only letters, numbers, dots, hyphens, and underscores',
        );
    }
}

export function assertSchemaVersion(version: string): void {
    if (!isValidSchemaVersion(version)) {
        throw new Error(
            'Schema versions must contain only letters, numbers, dots, hyphens, underscores, and plus signs',
        );
    }
}
