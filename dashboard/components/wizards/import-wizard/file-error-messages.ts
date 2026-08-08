import { getErrorMessage } from '../../../../shared';
import {
    FileParseError,
} from '../../../constants';
import { FileUploadError } from '../../../utils/file-upload-error';

export interface FileParseErrorMessages {
    invalidJson: string;
    emptyExcelWorkbook: string;
}

export interface FileUploadErrorMessages {
    missingFileId: string;
    httpError: (status: number) => string;
}

export function getFileParseErrorMessage(
    error: unknown,
    messages: FileParseErrorMessages,
): string {
    if (!(error instanceof FileParseError)) {
        return getErrorMessage(error);
    }
    return error.code === 'INVALID_JSON'
        ? messages.invalidJson
        : messages.emptyExcelWorkbook;
}

export function getFileUploadErrorMessage(
    error: unknown,
    messages: FileUploadErrorMessages,
): string {
    if (!(error instanceof FileUploadError)) {
        return getErrorMessage(error);
    }
    if (error.code === 'MISSING_FILE_ID') {
        return messages.missingFileId;
    }
    return messages.httpError(error.status ?? 0);
}
