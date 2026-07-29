import { describe, expect, it } from 'vitest';
import { resolveSinkIdentityField } from './sink.executor';

describe('sink identity contract', () => {
    it('uses the Meilisearch primary key for upsert and delete identity', () => {
        expect(resolveSinkIdentityField('meilisearch', {
            primaryKey: 'productNumber',
            idField: 'legacyId',
        })).toBe('productNumber');
    });

    it('uses idField for other sinks', () => {
        expect(resolveSinkIdentityField('elasticsearch', {
            primaryKey: 'ignored',
            idField: 'sku',
        })).toBe('sku');
    });
});
