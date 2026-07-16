import { describe, expect, it } from 'vitest';
import { VendureQueryExtractor } from './vendure-query.extractor';

describe('VendureQueryExtractor configuration', () => {
    const extractor = new VendureQueryExtractor({} as never);

    it('accepts relation path arrays', async () => {
        const result = await extractor.validate({} as never, {
            entity: 'PRODUCT',
            relations: ['variants', 'variants.translations'],
        });

        expect(result).toEqual({ valid: true, errors: [] });
    });

    it('rejects legacy comma-separated relation strings', async () => {
        const result = await extractor.validate({} as never, {
            entity: 'PRODUCT',
            relations: 'variants,translations',
        } as never);

        expect(result).toEqual({
            valid: false,
            errors: [{
                field: 'relations',
                message: 'Relations must be an array of relation paths',
            }],
        });
    });
});
