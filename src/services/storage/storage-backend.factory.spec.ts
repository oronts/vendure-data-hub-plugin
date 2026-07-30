import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createStorageBackendFromEnv,
    parseStorageType,
} from './storage-backend.factory';

describe('storage backend configuration', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it.each([
        [undefined, 'local'],
        ['', 'local'],
        ['LOCAL', 'local'],
        [' s3 ', 's3'],
    ] as const)('normalizes %s to %s', (value, expected) => {
        expect(parseStorageType(value)).toBe(expected);
    });

    it('rejects unknown storage types instead of falling back to local storage', () => {
        expect(() => parseStorageType('filesystem')).toThrow(
            'Unsupported DATA_HUB_STORAGE_TYPE "filesystem"',
        );
    });

    it('selects S3 case-insensitively', () => {
        vi.stubEnv('DATA_HUB_STORAGE_TYPE', 'S3');
        vi.stubEnv('DATA_HUB_S3_BUCKET', 'data-hub-test');

        expect(createStorageBackendFromEnv().type).toBe('s3');
    });

    it.each(['0', '-1', '1.5', 'invalid'])('rejects invalid S3 URL expiry %s', value => {
        vi.stubEnv('DATA_HUB_STORAGE_TYPE', 's3');
        vi.stubEnv('DATA_HUB_S3_BUCKET', 'data-hub-test');
        vi.stubEnv('DATA_HUB_S3_URL_EXPIRY', value);

        expect(() => createStorageBackendFromEnv()).toThrow(
            'DATA_HUB_S3_URL_EXPIRY must be a positive integer',
        );
    });

    it.each([
        ['DATA_HUB_S3_ACCESS_KEY_ID', 'DATA_HUB_S3_SECRET_ACCESS_KEY'],
        ['DATA_HUB_S3_SECRET_ACCESS_KEY', 'DATA_HUB_S3_ACCESS_KEY_ID'],
    ] as const)('rejects %s without %s', (configuredKey, missingKey) => {
        vi.stubEnv('DATA_HUB_STORAGE_TYPE', 's3');
        vi.stubEnv('DATA_HUB_S3_BUCKET', 'data-hub-test');
        vi.stubEnv(configuredKey, 'configured');
        vi.stubEnv(missingKey, '');

        expect(() => createStorageBackendFromEnv()).toThrow(
            'DATA_HUB_S3_ACCESS_KEY_ID and DATA_HUB_S3_SECRET_ACCESS_KEY must be configured together',
        );
    });
});
