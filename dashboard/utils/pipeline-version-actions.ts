import { PIPELINE_STATUS, REVISION_TYPE } from '../constants';
import type { PipelineStatus } from '../constants';

export interface PipelineTimelineRevisionState {
    id: string;
    type: string;
    isLatest: boolean;
    isCurrent: boolean;
}

export interface PipelineVersionActions {
    compare: boolean;
    restoreDraft: boolean;
    revertPublished: boolean;
}

export function getPipelineVersionActions(
    revision: PipelineTimelineRevisionState,
    currentRevisionId: string | undefined,
    pipelineStatus: PipelineStatus | undefined,
): PipelineVersionActions {
    return {
        compare: currentRevisionId != null && revision.id !== currentRevisionId,
        restoreDraft:
            revision.type === REVISION_TYPE.DRAFT
            && !revision.isLatest
            && pipelineStatus === PIPELINE_STATUS.DRAFT,
        revertPublished:
            revision.type === REVISION_TYPE.PUBLISHED
            && !revision.isCurrent
            && pipelineStatus === PIPELINE_STATUS.PUBLISHED,
    };
}
