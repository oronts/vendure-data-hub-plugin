import multer from 'multer';
import { FILE_STORAGE } from '../../constants/index';
import { validateFileDescriptor } from '../../services/storage/file-storage-metadata';
import { detectMimeType } from './file-upload.utils';

export interface MulterErrorLike extends Error {
    code?: string;
}

export function resolveUploadExpiry(body: unknown): number | undefined {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return FILE_STORAGE.EXPIRY_MINUTES;
    }

    const values = body as Record<string, unknown>;
    if (values.persistent === true || values.persistent === 'true') {
        return undefined;
    }

    const requestedMinutes = Number(values.expiresInMinutes);
    if (!Number.isFinite(requestedMinutes) || requestedMinutes < 1) {
        return FILE_STORAGE.EXPIRY_MINUTES;
    }
    return Math.min(Math.floor(requestedMinutes), FILE_STORAGE.MAX_EXPIRY_MINUTES);
}

export const fileUploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: FILE_STORAGE.MAX_FILE_SIZE_BYTES,
        files: FILE_STORAGE.FILE_MAX_FILES,
    },
    fileFilter: (_request, file, callback) => {
        try {
            validateFileDescriptor(
                file.originalname,
                file.mimetype || detectMimeType(file.originalname),
            );
            callback(null, true);
        } catch (error) {
            callback(error instanceof Error ? error : new Error('Unsupported file type'));
        }
    },
});
