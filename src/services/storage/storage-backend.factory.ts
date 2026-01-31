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
import { ConnectionType } from '../../constants/enums';

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

export function createStorageBackendFromEnv(): StorageBackend {
    const storageType = process.env.DATA_HUB_STORAGE_TYPE || 'local';

    if (storageType === ConnectionType.S3) {
        const bucket = process.env.DATA_HUB_S3_BUCKET;
        const region = process.env.DATA_HUB_S3_REGION || 'us-east-1';

        if (!bucket) {
            throw new Error('DATA_HUB_S3_BUCKET environment variable is required for S3 storage');
        }

        return new S3StorageBackend({
            bucket,
            region,
            accessKeyId: process.env.DATA_HUB_S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.DATA_HUB_S3_SECRET_ACCESS_KEY,
            endpoint: process.env.DATA_HUB_S3_ENDPOINT,
            prefix: process.env.DATA_HUB_S3_PREFIX,
            signedUrlExpiry: Number(process.env.DATA_HUB_S3_URL_EXPIRY) || 3600,
        });
    }

    const basePath = process.env.DATA_HUB_STORAGE_PATH || 'data-hub-uploads';
    return new LocalStorageBackend({ basePath });
}
