import { describe, expect, it } from 'vitest';
import { SortOrder } from '../types';
import {
    createCodeReferenceListOptions,
    REFERENCE_SELECTOR_PAGE_SIZE,
} from './reference-list-options';

describe('reference list options', () => {
    it('creates a small deterministic server-side code search', () => {
        expect(createCodeReferenceListOptions('  api  ')).toEqual({
            take: REFERENCE_SELECTOR_PAGE_SIZE,
            skip: 0,
            sort: { code: SortOrder.ASC },
            filter: { code: { contains: 'api' } },
        });
    });

    it('omits the filter for an empty search', () => {
        expect(createCodeReferenceListOptions('  ').filter).toBeUndefined();
    });
});
