import { getErrorMessage } from '../../../../shared';
import {
    FileParseError,
    IMPORT_WIZARD_TRANSLATION_IDS,
} from '../../../constants';
import { FileUploadError } from '../../../utils/file-upload-error';

type Translate = (
    id: string,
    values?: Record<string, string | number>,
) => string;

export function getFileParseErrorMessage(
    error: unknown,
    translate: Translate,
): string {
    if (!(error instanceof FileParseError)) {
        return getErrorMessage(error);
    }
    return translate(
        error.code === 'INVALID_JSON'
            ? IMPORT_WIZARD_TRANSLATION_IDS.INVALID_JSON_FILE
            : IMPORT_WIZARD_TRANSLATION_IDS.EMPTY_EXCEL_WORKBOOK,
    );
}

export function getFileUploadErrorMessage(
    error: unknown,
    translate: Translate,
): string {
    if (!(error instanceof FileUploadError)) {
        return getErrorMessage(error);
    }
    if (error.code === 'MISSING_FILE_ID') {
        return translate(
            IMPORT_WIZARD_TRANSLATION_IDS.UPLOAD_RESPONSE_MISSING_ID,
        );
    }
    return translate(
        IMPORT_WIZARD_TRANSLATION_IDS.UPLOAD_HTTP_ERROR,
        { status: error.status ?? 0 },
    );
}
