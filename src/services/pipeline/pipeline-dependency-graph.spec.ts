import { describe, expect, it } from 'vitest';
import { findReachableDependencyCycle } from './pipeline-dependency-graph';

describe('findReachableDependencyCycle', () => {
    it('returns null for an acyclic reachable graph', () => {
        expect(findReachableDependencyCycle(
            'catalog',
            { dependsOn: ['inventory'] },
            [
                { code: 'inventory', definition: { dependsOn: ['source'] } },
                { code: 'source', definition: {} },
            ],
        )).toBeNull();
    });

    it('reports a direct self dependency', () => {
        expect(findReachableDependencyCycle(
            'catalog',
            { dependsOn: ['catalog'] },
            [],
        )).toEqual(['catalog', 'catalog']);
    });

    it('reports an indirect reachable cycle', () => {
        expect(findReachableDependencyCycle(
            'catalog',
            { dependsOn: ['inventory'] },
            [
                { code: 'inventory', definition: { dependsOn: ['pricing'] } },
                { code: 'pricing', definition: { dependsOn: ['catalog'] } },
            ],
        )).toEqual(['catalog', 'inventory', 'pricing', 'catalog']);
    });
});
