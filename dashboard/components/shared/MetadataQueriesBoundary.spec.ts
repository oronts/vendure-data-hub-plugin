import { describe, expect, it, vi } from 'vitest';
import {
    getMetadataBoundaryStatus,
    type MetadataQueryState,
} from './metadata-query-state';

function query(overrides: Partial<MetadataQueryState> = {}): MetadataQueryState {
    return {
        label: 'metadata',
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

describe('getMetadataBoundaryStatus', () => {
    it('prioritizes an actionable error over another pending query', () => {
        const failed = query({ isError: true, error: new Error('denied') });

        expect(getMetadataBoundaryStatus([
            query({ isPending: true }),
            failed,
        ])).toEqual({ state: 'error', query: failed });
    });

    it('distinguishes loading from ready metadata', () => {
        expect(getMetadataBoundaryStatus([query({ isPending: true })]))
            .toEqual({ state: 'loading' });
        expect(getMetadataBoundaryStatus([query(), query()]))
            .toEqual({ state: 'ready' });
    });
});
