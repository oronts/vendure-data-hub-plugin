import { HttpStatus } from '@nestjs/common';
import multer from 'multer';
import { FILE_STORAGE, PAGINATION } from '../../constants/index';
import { validateFileDescriptor } from '../../services/storage/file-storage-metadata';
import { detectMimeType } from './file-upload.utils';

export interface MulterErrorLike extends Error {
    code?: string;
    field?: string;
}

export class FileUploadInputError extends Error {}

export interface MulterUploadErrorResponse {
    status: HttpStatus;
    error: string;
}

export function resolveMulterUploadError(
    error: MulterErrorLike,
): MulterUploadErrorResponse | undefined {
    if (error.code === 'LIMIT_FILE_SIZE') {
        return {
            status: HttpStatus.PAYLOAD_TOO_LARGE,
            error: `File too large. Maximum size is ${FILE_STORAGE.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
        };
    }
    if (error.code === 'LIMIT_FILE_COUNT' ||
        (error.code === 'LIMIT_UNEXPECTED_FILE' && error.field === 'file')) {
        return {
            status: HttpStatus.BAD_REQUEST,
            error: `Too many files. Maximum is ${FILE_STORAGE.FILE_MAX_FILES}`,
        };
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return {
            status: HttpStatus.BAD_REQUEST,
            error: 'The upload file field must be named "file"',
        };
    }
    if (error.code === 'LIMIT_FIELD_COUNT' ||
        error.code === 'LIMIT_PART_COUNT' ||
        error.code === 'LIMIT_FIELD_VALUE' ||
        error.code === 'LIMIT_FIELD_KEY' ||
        error.code === 'MISSING_FIELD_NAME') {
        return {
            status: HttpStatus.BAD_REQUEST,
            error: 'Multipart form exceeds the supported upload fields',
        };
    }
    return undefined;
}

const INTEGER_PATTERN = /^\d+$/;

function parseRequestInteger(
    value: unknown,
    field: string,
    minimum: number,
    maximum: number,
): number {
    const parsed = typeof value === 'number'
        ? value
        : typeof value === 'string' && INTEGER_PATTERN.test(value)
            ? Number(value)
            : NaN;
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new FileUploadInputError(
            `${field} must be an integer from ${minimum} to ${maximum}`,
        );
    }
    return parsed;
}

export function resolveUploadExpiry(body: unknown): number | undefined {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return FILE_STORAGE.EXPIRY_MINUTES;
    }

    const values = body as Record<string, unknown>;
    const persistent = values.persistent;
    if (persistent !== undefined && persistent !== true && persistent !== false &&
        persistent !== 'true' && persistent !== 'false') {
        throw new FileUploadInputError('persistent must be true or false');
    }
    const isPersistent = persistent === true || persistent === 'true';
    if (isPersistent && values.expiresInMinutes !== undefined) {
        throw new FileUploadInputError(
            'persistent and expiresInMinutes cannot be used together',
        );
    }
    if (isPersistent) {
        return undefined;
    }

    if (values.expiresInMinutes === undefined) {
        return FILE_STORAGE.EXPIRY_MINUTES;
    }
    return parseRequestInteger(
        values.expiresInMinutes,
        'expiresInMinutes',
        1,
        FILE_STORAGE.MAX_EXPIRY_MINUTES,
    );
}

export function resolveFileListLimit(value?: string): number {
    return value === undefined
        ? PAGINATION.LIST_PAGE_SIZE
        : parseRequestInteger(value, 'limit', 1, PAGINATION.MAX_QUERY_LIMIT);
}

export function resolveFileListOffset(value?: string): number {
    return value === undefined
        ? 0
        : parseRequestInteger(value, 'offset', 0, FILE_STORAGE.MAX_FILE_INDEX_SIZE);
}

export function resolveFilePreviewRows(value?: string): number {
    return value === undefined
        ? PAGINATION.FILE_PREVIEW_ROWS
        : parseRequestInteger(value, 'rows', 1, PAGINATION.MAX_QUERY_LIMIT);
}

export const fileUploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: FILE_STORAGE.MAX_FILE_SIZE_BYTES,
        files: FILE_STORAGE.FILE_MAX_FILES,
        fields: FILE_STORAGE.MAX_MULTIPART_FIELDS,
        parts: FILE_STORAGE.MULTIPART_PART_LIMIT,
        fieldSize: FILE_STORAGE.MAX_MULTIPART_FIELD_SIZE_BYTES,
        fieldNameSize: FILE_STORAGE.MAX_MULTIPART_FIELD_NAME_SIZE_BYTES,
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
