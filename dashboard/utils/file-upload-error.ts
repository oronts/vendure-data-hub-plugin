export type FileUploadErrorCode = 'HTTP_ERROR' | 'MISSING_FILE_ID';

export class FileUploadError extends Error {
    constructor(
        readonly code: FileUploadErrorCode,
        readonly status?: number,
    ) {
        super(code);
        this.name = 'FileUploadError';
    }
}
