import { describe, expect, it } from 'vitest';
import { getPipelineReviewActionVisibility } from './pipeline-review-actions';

describe('getPipelineReviewActionVisibility', () => {
    it('shows rejection to a reviewer without exposing publication', () => {
        expect(getPipelineReviewActionVisibility(true, false)).toEqual({
            reject: true,
            approve: false,
            publish: false,
        });
    });

    it('shows direct publication to a publisher-only role', () => {
        expect(getPipelineReviewActionVisibility(false, true)).toEqual({
            reject: false,
            approve: false,
            publish: true,
        });
    });

    it('uses the combined approval action when both permissions are held', () => {
        expect(getPipelineReviewActionVisibility(true, true)).toEqual({
            reject: true,
            approve: true,
            publish: false,
        });
    });

    it('shows no review action without either permission', () => {
        expect(getPipelineReviewActionVisibility(false, false)).toEqual({
            reject: false,
            approve: false,
            publish: false,
        });
    });
});
