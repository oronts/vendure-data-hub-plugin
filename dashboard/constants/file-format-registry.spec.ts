import { describe, expect, it, vi } from 'vitest';

const xlsxModule = vi.hoisted(() => ({
    loads: 0,
    read: vi.fn(() => ({
        SheetNames: ['Products'],
        Sheets: { Products: {} },
    })),
    sheetToJson: vi.fn(() => [
        { sku: 'SKU-1', name: 'First' },
        { sku: 'SKU-2', name: 'Second' },
    ]),
}));

vi.mock('xlsx', () => {
    xlsxModule.loads += 1;
    return {
        read: xlsxModule.read,
        utils: { sheet_to_json: xlsxModule.sheetToJson },
    };
});
import {
    FILE_FORMAT_REGISTRY,
    FileParseError,
} from './file-format-registry';

describe('file format registry', () => {
    it('marks XML preview as unsupported without a no-op parser', () => {
        const xml = FILE_FORMAT_REGISTRY.get('XML');

        expect(xml).toMatchObject({ supportsPreview: false });
        expect(xml?.parse).toBeUndefined();
    });

    it('reports invalid JSON with a stable client error code', async () => {
        const parser = FILE_FORMAT_REGISTRY.get('JSON')?.parse;

        await expect(parser?.(new File(['{'], 'invalid.json'))).rejects.toEqual(
            expect.objectContaining<Partial<FileParseError>>({
                code: 'INVALID_JSON',
            }),
        );
    });

    it('loads XLSX support only when a spreadsheet preview is requested', async () => {
        const jsonParser = FILE_FORMAT_REGISTRY.get('JSON')?.parse;
        const xlsxParser = FILE_FORMAT_REGISTRY.get('XLSX')?.parse;

        expect(xlsxModule.loads).toBe(0);
        await jsonParser?.(new File(['[{"sku":"JSON-1"}]'], 'products.json'));
        expect(xlsxModule.loads).toBe(0);

        const result = await xlsxParser?.(
            new File([new Uint8Array([0x50, 0x4b])], 'products.xlsx'),
            { maxRows: 1 },
        );

        expect(xlsxModule.loads).toBe(1);
        expect(xlsxModule.read).toHaveBeenCalledWith(
            expect.any(ArrayBuffer),
            { type: 'array' },
        );
        expect(xlsxModule.sheetToJson).toHaveBeenCalledWith(
            expect.any(Object),
            { defval: '' },
        );
        expect(result).toEqual({
            headers: ['sku', 'name'],
            rows: [{ sku: 'SKU-1', name: 'First' }],
        });
    });
});
