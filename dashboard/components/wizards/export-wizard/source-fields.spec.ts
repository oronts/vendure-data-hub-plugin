import { describe, expect, it } from 'vitest';
import { reconcileSourceFields } from './source-fields';

describe('reconcileSourceFields', () => {
    const templateFields = [{
        sourceField: 'sku',
        outputName: 'item_group_id',
        include: true,
    }];

    it('preserves valid mappings when requested', () => {
        expect(reconcileSourceFields({
            currentFields: templateFields,
            fieldNames: ['id', 'sku', 'name'],
            preserveCurrentFields: true,
        })).toEqual(templateFields);
    });

    it('replaces mappings when the selected entity changes', () => {
        expect(reconcileSourceFields({
            currentFields: templateFields,
            fieldNames: ['id', 'code'],
        })).toEqual([
            { sourceField: 'id', outputName: 'id', include: true },
            { sourceField: 'code', outputName: 'code', include: true },
        ]);
    });

    it('clears fields when the backend returns an empty schema', () => {
        expect(reconcileSourceFields({
            currentFields: templateFields,
            fieldNames: [],
        })).toEqual([]);
    });

    it('drops stale template fields while preserving valid mappings', () => {
        expect(reconcileSourceFields({
            currentFields: [
                ...templateFields,
                { sourceField: 'legacyPrice', outputName: 'price', include: true },
            ],
            fieldNames: ['id', 'sku'],
            preserveCurrentFields: true,
        })).toEqual(templateFields);
    });
});
