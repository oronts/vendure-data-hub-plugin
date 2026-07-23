import { describe, expect, it } from 'vitest';
import { normalizeVendureListOptions } from './vendure-list-document';

describe('normalizeVendureListOptions', () => {
    it('preserves supported logical filter operators', () => {
        expect(normalizeVendureListOptions({
            filter: { name: { contains: 'catalog' } },
            filterOperator: 'OR',
        })).toEqual({
            skip: undefined,
            take: undefined,
            sort: undefined,
            filter: { name: { contains: 'catalog' } },
            filterOperator: 'OR',
        });
    });

    it('drops malformed filter operators at the untyped boundary', () => {
        expect(normalizeVendureListOptions({ filterOperator: 'XOR' })?.filterOperator)
            .toBeUndefined();
    });
});
