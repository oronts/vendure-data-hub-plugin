import { describe, expect, it } from 'vitest';
import { createImportTargetChange } from './target-state';

describe('createImportTargetChange', () => {
    it('clears entity-specific schema, mappings, and lookup fields', () => {
        expect(createImportTargetChange({
            targetEntity: 'product',
            targetSchema: {
                $id: 'product',
                label: 'Product',
                fields: { sku: { type: 'string' } },
            },
            mappings: [{
                sourceField: 'sku',
                targetField: 'sku',
                required: true,
            }],
            strategies: {
                existingRecords: 'REPLACE',
                lookupFields: ['sku'],
                batchSize: 25,
                parallelBatches: 2,
                continueOnError: false,
            },
        }, 'customer')).toEqual({
            targetEntity: 'customer',
            targetSchema: undefined,
            mappings: [],
            strategies: {
                existingRecords: 'REPLACE',
                lookupFields: [],
                batchSize: 25,
                parallelBatches: 2,
                continueOnError: false,
            },
        });
    });

    it('does not reset state when the selected entity is unchanged', () => {
        expect(createImportTargetChange({ targetEntity: 'product' }, 'product'))
            .toEqual({ targetEntity: 'product' });
    });
});
