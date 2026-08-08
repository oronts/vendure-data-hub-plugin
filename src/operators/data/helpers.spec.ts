import { describe, expect, it } from 'vitest';
import { applyUuid } from './helpers';

describe('UUID operator helper', () => {
    it('generates deterministic v5 UUIDs for well-known namespaces', () => {
        const record = { sku: 'SKU-1' };
        const first = applyUuid(record, 'id', 'v5', 'url', 'sku');
        const second = applyUuid(record, 'id', 'v5', 'url', 'sku');

        expect(first).toEqual(second);
        expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it.each([
        'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
        '6ba7b8119dad11d180b400c04fd430c8',
        '6ba7b811-9dad-11d1-80b4-00c04fd430cg',
    ])('rejects malformed namespace %s', namespace => {
        expect(applyUuid(
            { sku: 'SKU-1' },
            'id',
            'v5',
            namespace,
            'sku',
        )).toEqual({ sku: 'SKU-1', id: null });
    });
});
