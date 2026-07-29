import { describe, expect, it } from 'vitest';
import { mapValidationIssueForApi } from './pipeline.resolver';

describe('pipeline validation API mapping', () => {
    it('exposes the service error code through the GraphQL reason field', () => {
        expect(mapValidationIssueForApi({
            message: 'Step is missing an adapter',
            stepKey: 'load-products',
            field: 'adapterCode',
            errorCode: 'missing-adapter-code',
        })).toEqual({
            message: 'Step is missing an adapter',
            stepKey: 'load-products',
            field: 'adapterCode',
            reason: 'missing-adapter-code',
        });
    });
});
