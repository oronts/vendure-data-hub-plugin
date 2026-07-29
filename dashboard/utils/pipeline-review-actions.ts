export interface PipelineReviewActionVisibility {
    reject: boolean;
    approve: boolean;
    publish: boolean;
}

export function getPipelineReviewActionVisibility(
    canReview: boolean,
    canPublish: boolean,
): PipelineReviewActionVisibility {
    return {
        reject: canReview,
        approve: canReview && canPublish,
        publish: !canReview && canPublish,
    };
}
