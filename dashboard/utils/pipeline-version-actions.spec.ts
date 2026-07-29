import { describe, expect, it } from 'vitest';
import { getPipelineVersionActions } from './pipeline-version-actions';

describe('getPipelineVersionActions', () => {
    it('allows comparison and rollback for a historical published revision', () => {
        expect(getPipelineVersionActions({
            id: 'published-1',
            type: 'PUBLISHED',
            isLatest: false,
            isCurrent: false,
        }, 'published-2', 'PUBLISHED')).toEqual({
            compare: true,
            restoreDraft: false,
            revertPublished: true,
        });
    });

    it('does not expose rollback outside the published lifecycle state', () => {
        expect(getPipelineVersionActions({
            id: 'published-1',
            type: 'PUBLISHED',
            isLatest: false,
            isCurrent: false,
        }, 'published-2', 'REVIEW').revertPublished).toBe(false);
    });

    it('does not restore a draft while review or publication is active', () => {
        expect(getPipelineVersionActions({
            id: 'draft-1',
            type: 'DRAFT',
            isLatest: false,
            isCurrent: false,
        }, 'published-1', 'REVIEW').restoreDraft).toBe(false);
    });

    it('allows restoring an older draft but not the active draft', () => {
        expect(getPipelineVersionActions({
            id: 'draft-1',
            type: 'DRAFT',
            isLatest: false,
            isCurrent: false,
        }, 'published-1', 'DRAFT')).toEqual({
            compare: true,
            restoreDraft: true,
            revertPublished: false,
        });

        expect(getPipelineVersionActions({
            id: 'draft-2',
            type: 'DRAFT',
            isLatest: true,
            isCurrent: false,
        }, 'published-1', 'DRAFT').restoreDraft).toBe(false);
    });

    it('does not compare the active revision with itself', () => {
        expect(getPipelineVersionActions({
            id: 'published-2',
            type: 'PUBLISHED',
            isLatest: true,
            isCurrent: true,
        }, 'published-2', 'PUBLISHED').compare).toBe(false);
    });
});
