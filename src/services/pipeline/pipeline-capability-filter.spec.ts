import { describe, expect, it } from 'vitest';
import { LogicalOperator } from '@vendure/common/lib/generated-types';
import { Pipeline } from '../../entities/pipeline';
import type { PipelineDefinition } from '../../types';
import {
    extractPipelineCapabilityFilters,
    pipelineMatchesCapabilityFilters,
} from './pipeline-capability-filter';

const registry = {
    find: (_type: string, code: string) => code === 'productUpsert'
        ? { requires: ['UpdateCatalog'] }
        : undefined,
};

function pipeline(definition: PipelineDefinition): Pipeline {
    return Object.assign(new Pipeline(), { definition });
}

describe('pipeline capability filters', () => {
    it('extracts exact capability filters from conjunctive groups', () => {
        const result = extractPipelineCapabilityFilters({
            take: 10,
            filter: {
                status: { eq: 'PUBLISHED' },
                _and: [{
                    requiredCapabilities: { in: ['UpdateCatalog', 'UpdateOrder'] },
                }, {
                    writeCapabilities: { eq: 'CATALOG' },
                }],
            },
        });

        expect(result.options).toEqual({
            take: 10,
            filter: { status: { eq: 'PUBLISHED' } },
        });
        expect(result.predicates).toEqual([{
            field: 'requiredCapabilities',
            operators: { in: ['UpdateCatalog', 'UpdateOrder'] },
        }, {
            field: 'writeCapabilities',
            operators: { eq: 'CATALOG' },
        }]);
    });

    it('rejects capability filters with ambiguous OR semantics', () => {
        expect(() => extractPipelineCapabilityFilters({
            filterOperator: LogicalOperator.OR,
            filter: { requiredCapabilities: { eq: 'UpdateCatalog' } },
        })).toThrow('filterOperator OR');
        expect(() => extractPipelineCapabilityFilters({
            filter: {
                _or: [{ requiredCapabilities: { eq: 'UpdateCatalog' } }],
            },
        })).toThrow('do not support _or');
    });

    it('matches derived permissions and declared write domains exactly', () => {
        const value = pipeline({
            version: 1,
            capabilities: { writes: ['CATALOG'] },
            steps: [{
                key: 'load',
                type: 'LOAD',
                config: { adapterCode: 'productUpsert' },
            }],
        });

        expect(pipelineMatchesCapabilityFilters(registry as never, value, [{
            field: 'requiredCapabilities',
            operators: { eq: 'UpdateCatalog' },
        }, {
            field: 'writeCapabilities',
            operators: { in: ['ORDERS', 'CATALOG'] },
        }])).toBe(true);
        expect(pipelineMatchesCapabilityFilters(registry as never, value, [{
            field: 'requiredCapabilities',
            operators: { eq: 'Update' },
        }])).toBe(false);
    });
});
