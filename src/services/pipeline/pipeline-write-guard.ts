import type { ID } from '@vendure/core';
import type { PipelineStatus } from '../../constants/enums';
import type { Pipeline } from '../../entities/pipeline';

interface PipelineWriteGuard {
    id: ID;
    status: PipelineStatus;
    publishedVersionCount: number;
    rowVersion: number;
}

interface PipelineWriteGuardOverrides {
    status?: PipelineStatus;
    publishedVersionCount?: number;
    rowVersion?: number;
}

export function createPipelineWriteGuard(
    pipeline: Pipeline,
    overrides: PipelineWriteGuardOverrides = {},
): PipelineWriteGuard {
    return {
        id: pipeline.id,
        status: overrides.status ?? pipeline.status,
        publishedVersionCount:
            overrides.publishedVersionCount ?? pipeline.publishedVersionCount,
        rowVersion: overrides.rowVersion ?? pipeline.rowVersion,
    };
}

export function advancePipelineRowVersion(
    pipeline: Pipeline,
    writes = 1,
): void {
    pipeline.rowVersion += writes;
}
