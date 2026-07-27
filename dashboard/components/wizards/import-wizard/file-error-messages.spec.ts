import { describe, expect, it, vi } from 'vitest';
import {
    FileParseError,
    IMPORT_WIZARD_TRANSLATION_IDS,
} from '../../../constants';
import { FileUploadError } from '../../../utils/file-upload-error';
import {
    getFileParseErrorMessage,
    getFileUploadErrorMessage,
} from './file-error-messages';

describe('import file error messages', () => {
    const translate = vi.fn(
        (id: string, values?: Record<string, string | number>) =>
            values ? `${id}:${JSON.stringify(values)}` : id,
    );

    it('maps client parse failures to stable translation IDs', () => {
        expect(getFileParseErrorMessage(
            new FileParseError('INVALID_JSON'),
            translate,
        )).toBe(IMPORT_WIZARD_TRANSLATION_IDS.INVALID_JSON_FILE);
        expect(getFileParseErrorMessage(
            new FileParseError('EMPTY_EXCEL_WORKBOOK'),
            translate,
        )).toBe(IMPORT_WIZARD_TRANSLATION_IDS.EMPTY_EXCEL_WORKBOOK);
    });

    it('maps malformed upload responses and status failures', () => {
        expect(getFileUploadErrorMessage(
            new FileUploadError('MISSING_FILE_ID'),
            translate,
        )).toBe(IMPORT_WIZARD_TRANSLATION_IDS.UPLOAD_RESPONSE_MISSING_ID);
        expect(getFileUploadErrorMessage(
            new FileUploadError('HTTP_ERROR', 503),
            translate,
        )).toContain('"status":503');
    });

    it('preserves server-provided errors', () => {
        expect(getFileUploadErrorMessage(
            new Error('Server rejected the file'),
            translate,
        )).toBe('Server rejected the file');
    });
});
