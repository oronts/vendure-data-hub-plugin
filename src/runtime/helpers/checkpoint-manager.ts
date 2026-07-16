import { RequestContext, ID } from '@vendure/core';
import { CheckpointService } from '../../services/data/checkpoint.service';
import { DataHubLogger } from '../../services/logger';
import { CheckpointData } from '../executor-types';

export class CheckpointManager {
    private cpData: CheckpointData | null = null;
    private cpDirty = false;

    constructor(
        private checkpointService: CheckpointService,
        private logger: DataHubLogger,
    ) {}

    getCheckpointData(): CheckpointData | null {
        return this.cpData;
    }

    isCheckpointDirty(): boolean {
        return this.cpDirty;
    }

    markCheckpointDirty(): void {
        this.cpDirty = true;
    }

    async loadCheckpoint(ctx: RequestContext, pipelineId?: ID): Promise<void> {
        this.cpData = null;
        this.cpDirty = false;

        if (!pipelineId) {
            return;
        }

        const checkpoint = await this.checkpointService.getByPipeline(ctx, pipelineId);
        this.cpData = (checkpoint?.data ?? {}) as CheckpointData;
    }

    async clearCheckpoint(ctx: RequestContext, pipelineId?: ID): Promise<void> {
        if (!pipelineId) {
            return;
        }

        await this.checkpointService.clearForPipeline(ctx, pipelineId);
        this.logger.debug('Checkpoint cleared for fresh run', {
            pipelineId: String(pipelineId),
        });
    }

    async saveCheckpoint(ctx: RequestContext, pipelineId?: ID): Promise<void> {
        if (!pipelineId || !this.cpDirty || !this.cpData) {
            return;
        }

        await this.checkpointService.setForPipeline(ctx, pipelineId, this.cpData);
        this.cpDirty = false;
    }
}
