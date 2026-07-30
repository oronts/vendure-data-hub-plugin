import { describe, expect, it } from 'vitest';
import type { PipelineDefinition, PipelineMetrics } from '../../types';
import {
    extractRecordDetails,
    fillUnknownRecordDetails,
} from './impact-record-details';
import { collectEntityBreakdown } from './impact-collectors';

const definition: PipelineDefinition = {
    version: 1,
    steps: [{ key: 'load', type: 'LOAD', config: { adapterCode: 'productUpsert' } }],
};

describe('impact record details', () => {
    it('extracts update diffs and builds entity operations from loader decisions', () => {
        const metrics: PipelineMetrics = {
            details: [{
                stepKey: 'load',
                recordDetails: [{
                    recordId: 'product-a',
                    entityType: 'Product',
                    operation: 'UPDATE',
                    currentState: { slug: 'product-a', name: 'Old' },
                    proposedState: { slug: 'product-a', name: 'New' },
                    validationErrors: [],
                    warnings: [],
                }],
            }],
        };

        const details = extractRecordDetails(metrics);
        const breakdown = collectEntityBreakdown(details, definition, 10);

        expect(details[0].diff).toEqual({
            name: { before: 'Old', after: 'New' },
        });
        expect(breakdown).toEqual([expect.objectContaining({
            entityType: 'Product',
            operations: {
                create: 0,
                update: 1,
                delete: 0,
                skip: 0,
                error: 0,
            },
            sampleRecordIds: ['product-a'],
        })]);
    });

    it('returns explicit unknown details when a loader has no record simulation', () => {
        const result = fillUnknownRecordDetails(
            ['SKU-1', 'SKU-2'],
            [],
            [{ step: 'extract', before: {}, after: { sku: 'SKU-1', name: 'One' } }],
            definition,
        );

        expect(result).toEqual([
            expect.objectContaining({
                recordId: 'SKU-1',
                operation: 'UNKNOWN',
                proposedState: { sku: 'SKU-1', name: 'One' },
            }),
            expect.objectContaining({
                recordId: 'SKU-2',
                operation: 'UNKNOWN',
                proposedState: {},
            }),
        ]);
    });

    it('does not assign an arbitrary entity type when multiple loaders exist', () => {
        const result = fillUnknownRecordDetails(
            ['unknown'],
            [],
            [],
            {
                version: 1,
                steps: [
                    { key: 'products', type: 'LOAD', config: { adapterCode: 'productUpsert' } },
                    { key: 'customers', type: 'LOAD', config: { adapterCode: 'customerUpsert' } },
                ],
            },
        );

        expect(result[0].entityType).toBe('Entity');
    });
});
