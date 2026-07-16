import { describe, expect, it } from 'vitest';
import { assertCreateDuplicateCanBeSkipped } from './duplicate-handling';

describe('CREATE duplicate handling', () => {
    it('allows an explicit skip policy', () => {
        expect(() => assertCreateDuplicateCanBeSkipped(
            { skipDuplicates: true },
            'product',
            'example-product',
        )).not.toThrow();
    });

    it('rejects duplicates unless skipping is explicit', () => {
        expect(() => assertCreateDuplicateCanBeSkipped(
            {},
            'product',
            'example-product',
        )).toThrow(
            'Duplicate product "example-product" during CREATE; set skipDuplicates to true to skip existing records',
        );
    });
});
