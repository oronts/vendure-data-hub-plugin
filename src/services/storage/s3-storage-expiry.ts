import { S3_STORAGE } from '../../constants/defaults';

export function validateS3SignedUrlExpiry(
    value: unknown,
    label = 'S3 signed URL expiry',
): number {
    if (
        typeof value !== 'number'
        || !Number.isSafeInteger(value)
        || value < S3_STORAGE.MIN_SIGNED_URL_EXPIRY_SEC
        || value > S3_STORAGE.MAX_SIGNED_URL_EXPIRY_SEC
    ) {
        throw new Error(
            `${label} must be an integer from ${S3_STORAGE.MIN_SIGNED_URL_EXPIRY_SEC} to ${S3_STORAGE.MAX_SIGNED_URL_EXPIRY_SEC} seconds`,
        );
    }
    return value;
}

export function resolveS3SignedUrlExpiry(value: unknown): number {
    return validateS3SignedUrlExpiry(
        value === undefined ? S3_STORAGE.SIGNED_URL_EXPIRY_SEC : value,
    );
}
