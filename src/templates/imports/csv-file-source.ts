import type { ImportTemplate } from './types';

type ImportSource = NonNullable<ImportTemplate['definition']['source']>;

export interface CsvFileSourceOptions {
    trimWhitespace?: boolean;
    allowedExtensions?: readonly string[];
}

export function createCsvFileSource(
    options: CsvFileSourceOptions = {},
): ImportSource {
    return {
        type: 'FILE_UPLOAD',
        format: {
            format: 'CSV',
            csv: {
                delimiter: ',',
                headerRow: true,
                ...(options.trimWhitespace ? { trimWhitespace: true } : {}),
            },
        },
        config: {
            type: 'FILE_UPLOAD',
            ...(options.allowedExtensions
                ? { allowedExtensions: [...options.allowedExtensions] }
                : {}),
        },
    };
}
