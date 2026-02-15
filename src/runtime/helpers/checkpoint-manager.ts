import { RequestContext, ID } from '@vendure/core';
import { CheckpointService } from '../../services/data/checkpoint.service';
import { DataHubLogger } from '../../services/logger';
import { CheckpointData } from '../executor-types';
import { getErrorMessage } from '../../utils/error.utils';

/**
 * Manages checkpoint data lifecycle: loading, saving, and clearing
 */
export class CheckpointManager {
    private cpData: CheckpointData | null = null;
    private cpDirty = false;

    constructor(
        private checkpointService: CheckpointService,
        private logger: DataHubLogger,
    ) {}

    /**
     * Get current checkpoint data
     */
    getCheckpointData(): CheckpointData | null {
        return this.cpData;
    }

    /**
     * Check if checkpoint is dirty (needs saving)
     */
    isCheckpointDirty(): boolean {
        return this.cpDirty;
    }

    /**
     * Mark checkpoint as dirty (needs saving)
     */
    markCheckpointDirty(): void {
        this.cpDirty = true;
    }

    /**
     * Load checkpoint data for a pipeline
     */
    async loadCheckpoint(ctx: RequestContext, pipelineId?: ID): Promise<void> {
        this.cpData = null;
        this.cpDirty = false;

        if (pipelineId) {
            try {
                const cp = await this.checkpointService.getByPipeline(ctx, pipelineId);
                this.cpData = (cp?.data ?? {}) as CheckpointData;
            } catch (err) {
                this.logger.debug('Failed to load checkpoint', {
                    pipelineId: String(pipelineId),
                    error: getErrorMessage(err),
                });
                this.cpData = {};
            }
        }
    }

    /**
     * Clear checkpoint data for a pipeline (fresh start)
     */
    async clearCheckpoint(ctx: RequestContext, pipelineId?: ID): Promise<void> {
        if (!pipelineId) return;

        try {
            await this.checkpointService.clearForPipeline(ctx, pipelineId);
            this.logger.debug('Checkpoint cleared for fresh run', {
                pipelineId: String(pipelineId),
            });
        } catch (err) {
            this.logger.debug('Failed to clear checkpoint', {
                pipelineId: String(pipelineId),
                error: getErrorMessage(err),
            });
        }
    }

    /**
     * Save checkpoint data if dirty
     */
    async saveCheckpoint(ctx: RequestContext, pipelineId?: ID): Promise<void> {
        if (pipelineId && this.cpDirty && this.cpData) {
            try {
                await this.checkpointService.setForPipeline(ctx, pipelineId, this.cpData);
            } catch (err) {
                this.logger.warn('Failed to save checkpoint', {
                    pipelineId: String(pipelineId),
                    error: getErrorMessage(err),
                });
            }
        }
    }
}
