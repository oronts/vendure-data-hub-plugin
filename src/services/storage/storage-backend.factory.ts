/**
 * Storage Backend Factory
 * Creates the appropriate storage backend based on configuration
 */

import {
    StorageBackend,
    StorageBackendOptions,
} from './storage-backend.interface';
import { LocalStorageBackend } from './local-storage.backend';
import { S3StorageBackend } from './s3-storage.backend';
import { S3_STORAGE } from '../../constants/defaults';
import { validateS3SignedUrlExpiry } from './s3-storage-expiry';

export function createStorageBackend(options: StorageBackendOptions): StorageBackend {
    switch (options.type) {
        case 's3':
            if (!options.s3) {
                throw new Error('S3 storage options are required when type is "s3"');
            }
            return new S3StorageBackend(options.s3);

        case 'local':
        default:
            if (!options.local) {
                throw new Error('Local storage options are required when type is "local"');
            }
            return new LocalStorageBackend(options.local);
    }
}

const DEFAULT_STORAGE_TYPE: StorageBackendOptions['type'] = 'local';
const SUPPORTED_STORAGE_TYPES = ['local', 's3'] as const;

export function parseStorageType(value: string | undefined): StorageBackendOptions['type'] {
    const normalized = (value?.trim() || DEFAULT_STORAGE_TYPE).toLowerCase();
    if (normalized === 'local' || normalized === 's3') return normalized;

    throw new Error(
        `Unsupported DATA_HUB_STORAGE_TYPE "${value}". Expected one of: ${SUPPORTED_STORAGE_TYPES.join(', ')}`,
    );
}

function readSignedUrlExpiry(value: string | undefined): number {
    if (value === undefined || value.trim() === '') return S3_STORAGE.SIGNED_URL_EXPIRY_SEC;
    return validateS3SignedUrlExpiry(
        Number(value),
        'DATA_HUB_S3_URL_EXPIRY',
    );
}

export function createStorageBackendFromEnv(): StorageBackend {
    const storageType = parseStorageType(process.env.DATA_HUB_STORAGE_TYPE);

    if (storageType === 's3') {
        const bucket = process.env.DATA_HUB_S3_BUCKET?.trim();
        const region = process.env.DATA_HUB_S3_REGION?.trim()
            || S3_STORAGE.DEFAULT_REGION;
        const accessKeyId = process.env.DATA_HUB_S3_ACCESS_KEY_ID?.trim() || undefined;
        const secretAccessKey = process.env.DATA_HUB_S3_SECRET_ACCESS_KEY?.trim() || undefined;

        if (!bucket) {
            throw new Error('DATA_HUB_S3_BUCKET environment variable is required for S3 storage');
        }
        if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
            throw new Error(
                'DATA_HUB_S3_ACCESS_KEY_ID and DATA_HUB_S3_SECRET_ACCESS_KEY must be configured together',
            );
        }

        return new S3StorageBackend({
            bucket,
            region,
            accessKeyId,
            secretAccessKey,
            endpoint: process.env.DATA_HUB_S3_ENDPOINT,
            prefix: process.env.DATA_HUB_S3_PREFIX,
            signedUrlExpiry: readSignedUrlExpiry(process.env.DATA_HUB_S3_URL_EXPIRY),
        });
    }

    const basePath = process.env.DATA_HUB_STORAGE_PATH || 'data-hub-uploads';
    return new LocalStorageBackend({ basePath });
}
