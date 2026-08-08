import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { AdapterOperatorHelpers, JsonObject } from '../types';
import { imageConvertOperator } from './image-convert.operator';
import { pdfGenerateOperator } from './pdf-generate.operator';

const helpers = {} as AdapterOperatorHelpers;

describe('file operators', () => {
    it('converts an image from and to nested field paths', async () => {
        const png = await sharp({
            create: {
                width: 2,
                height: 2,
                channels: 4,
                background: '#ff0000',
            },
        }).png().toBuffer();
        const records: JsonObject[] = [{ media: { source: png.toString('base64') } }];

        const result = await imageConvertOperator(records, {
            sourceField: 'media.source',
            targetField: 'media.optimized',
            format: 'webp',
        }, helpers);

        expect(result.errors).toBeUndefined();
        const optimized = (result.records[0].media as JsonObject).optimized as string;
        await expect(sharp(Buffer.from(optimized, 'base64')).metadata()).resolves.toMatchObject({
            format: 'webp',
            width: 2,
            height: 2,
        });
        expect((records[0].media as JsonObject).optimized).toBeUndefined();
    });

    it('reports invalid image records without mutating them', async () => {
        const record: JsonObject = { media: { source: 42 } };

        const result = await imageConvertOperator([record], {
            sourceField: 'media.source',
            format: 'webp',
        }, helpers);

        expect(result.records).toEqual([record]);
        expect(result.errors).toEqual([
            expect.objectContaining({ field: 'media.source', index: 0 }),
        ]);
    });

    it('generates a paginated PDF into a nested target field', async () => {
        const record: JsonObject = {
            customer: { name: 'Ada' },
            templates: { invoice: Array.from({ length: 120 }, () => 'Invoice for {{customer.name}}').join('\n') },
        };

        const result = await pdfGenerateOperator([record], {
            templateField: 'templates.invoice',
            targetField: 'files.invoicePdf',
            pageSize: 'A4',
        }, helpers);

        expect(result.errors).toBeUndefined();
        const pdfData = ((result.records[0].files as JsonObject).invoicePdf as string);
        const pdf = await PDFDocument.load(Buffer.from(pdfData, 'base64'));
        expect(pdf.getPageCount()).toBeGreaterThan(1);
        expect(record.files).toBeUndefined();
    });
});
