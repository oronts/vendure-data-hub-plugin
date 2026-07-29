import { describe, expect, it } from 'vitest';
import { FileParseError } from '../../../constants';
import { FileUploadError } from '../../../utils/file-upload-error';
import {
    getFileParseErrorMessage,
    getFileUploadErrorMessage,
} from './file-error-messages';

describe('import file error messages', () => {
    const parseMessages = {
        invalidJson: 'The selected file is not valid JSON.',
        emptyExcelWorkbook: 'The selected Excel workbook contains no sheets.',
    };
    const uploadMessages = {
        missingFileId: 'The upload response did not include a file ID.',
        httpError: (status: number) => `Upload failed with status ${status}.`,
    };

    it('maps client parse failures to stable translation IDs', () => {
        expect(getFileParseErrorMessage(
            new FileParseError('INVALID_JSON'),
            parseMessages,
        )).toBe(parseMessages.invalidJson);
        expect(getFileParseErrorMessage(
            new FileParseError('EMPTY_EXCEL_WORKBOOK'),
            parseMessages,
        )).toBe(parseMessages.emptyExcelWorkbook);
    });

    it('maps malformed upload responses and status failures', () => {
        expect(getFileUploadErrorMessage(
            new FileUploadError('MISSING_FILE_ID'),
            uploadMessages,
        )).toBe(uploadMessages.missingFileId);
        expect(getFileUploadErrorMessage(
            new FileUploadError('HTTP_ERROR', 503),
            uploadMessages,
        )).toBe('Upload failed with status 503.');
    });

    it('preserves server-provided errors', () => {
        expect(getFileUploadErrorMessage(
            new Error('Server rejected the file'),
            uploadMessages,
        )).toBe('Server rejected the file');
    });
});
