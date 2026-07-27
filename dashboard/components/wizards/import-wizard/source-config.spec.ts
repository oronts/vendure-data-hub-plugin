import { describe, expect, it } from 'vitest';
import {
    createDefaultImportSource,
    isImportSourceAvailable,
    mergeApiSourceConfig,
    mergeFileSourceConfig,
} from './source-config';

describe('import source config mergers', () => {
    it('creates complete file defaults and preserves existing values', () => {
        expect(mergeFileSourceConfig(undefined, { delimiter: ';' })).toEqual({
            type: 'FILE',
            fileConfig: { format: 'CSV', hasHeaders: true, delimiter: ';' },
        });
        expect(mergeFileSourceConfig({
            type: 'FILE',
            fileConfig: { format: 'JSON', hasHeaders: false, itemsPath: 'items' },
        }, { format: 'XML' })).toEqual({
            type: 'FILE',
            fileConfig: {
                format: 'XML',
                hasHeaders: false,
                itemsPath: 'items',
            },
        });
    });

    it('creates complete API defaults and preserves headers', () => {
        expect(mergeApiSourceConfig(undefined, { url: 'https://api.example.com' })).toEqual({
            type: 'API',
            apiConfig: { url: 'https://api.example.com', method: 'GET' },
        });
        expect(mergeApiSourceConfig({
            type: 'API',
            apiConfig: {
                url: 'https://old.example.com',
                method: 'POST',
                headers: { Accept: 'application/json' },
            },
        }, { method: 'GET' })).toEqual({
            type: 'API',
            apiConfig: {
                url: 'https://old.example.com',
                method: 'GET',
                headers: { Accept: 'application/json' },
            },
        });
    });

    it('keeps file access source-specific', () => {
        expect(isImportSourceAvailable('FILE', false)).toBe(false);
        expect(isImportSourceAvailable('API', false)).toBe(true);
        expect(isImportSourceAvailable('pimcoreGraphQL', false)).toBe(true);
        expect(isImportSourceAvailable('FILE', true)).toBe(true);

        expect(createDefaultImportSource(false)).toEqual({
            type: 'API',
            apiConfig: { url: '', method: 'GET' },
        });
        expect(createDefaultImportSource(true)).toEqual({
            type: 'FILE',
            fileConfig: { format: 'CSV', hasHeaders: true },
        });
    });
});
