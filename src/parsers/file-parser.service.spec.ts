import { describe, expect, it } from 'vitest';
import { FileParserService } from './file-parser.service';

describe('FileParserService preview bounds', () => {
    const service = new FileParserService();

    it('retains only the requested JSON preview rows while reporting the total', async () => {
        const preview = await service.preview(
            JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }]),
            { format: 'JSON' },
            2,
        );

        expect(preview.sampleData).toEqual([{ id: 1 }, { id: 2 }]);
        expect(preview.totalRows).toBe(3);
    });

    it('propagates the preview row limit to XML', async () => {
        const preview = await service.preview(
            '<products><product><id>1</id></product><product><id>2</id></product></products>',
            { format: 'XML', xml: { recordPath: '//product' } },
            1,
        );

        expect(preview.sampleData).toEqual([{ id: 1 }]);
        expect(preview.totalRows).toBe(2);
    });
});
