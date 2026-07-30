import { describe, expect, it } from 'vitest';
import { createCsvFileSource } from './csv-file-source';

describe('createCsvFileSource', () => {
    it('creates the canonical CSV upload source', () => {
        expect(createCsvFileSource()).toEqual({
            type: 'FILE_UPLOAD',
            format: {
                format: 'CSV',
                csv: {
                    delimiter: ',',
                    headerRow: true,
                },
            },
            config: { type: 'FILE_UPLOAD' },
        });
    });

    it('applies optional parsing and extension restrictions', () => {
        const allowedExtensions = ['.csv'] as const;

        expect(createCsvFileSource({
            trimWhitespace: true,
            allowedExtensions,
        })).toEqual({
            type: 'FILE_UPLOAD',
            format: {
                format: 'CSV',
                csv: {
                    delimiter: ',',
                    headerRow: true,
                    trimWhitespace: true,
                },
            },
            config: {
                type: 'FILE_UPLOAD',
                allowedExtensions: ['.csv'],
            },
        });
    });
});
