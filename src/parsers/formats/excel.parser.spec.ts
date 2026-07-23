import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import { parseExcel } from './excel.parser';

function createWorkbook(rowCount: number): Buffer {
    const workbook = utils.book_new();
    utils.book_append_sheet(
        workbook,
        utils.json_to_sheet(
            Array.from({ length: rowCount }, (_, index) => ({
                sku: `SKU-${index + 1}`,
            })),
        ),
        'Products',
    );
    return Buffer.from(write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

describe('parseExcel', () => {
    it('limits workbook materialization during previews', async () => {
        const content = createWorkbook(20);

        const preview = await parseExcel(content, {
            sheet: 'Products',
            preview: 3,
        });
        const complete = await parseExcel(content, { sheet: 'Products' });

        expect(preview.records).toHaveLength(3);
        expect(preview.records.at(-1)).toEqual({ sku: 'SKU-3' });
        expect(complete.records).toHaveLength(20);
    });
});
