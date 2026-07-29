import { RequestContext, ID } from '@vendure/core';
import { CheckpointService } from '../../services/data/checkpoint.service';
import { DataHubLogger } from '../../services/logger';
import { CheckpointData } from '../executor-types';
import { deepClone } from '../../utils/object-path.utils';
import { isDeepStrictEqual } from 'node:util';

export class CheckpointManager {
    private cpData: CheckpointData | null = null;
    private loadedData: CheckpointData | null = null;
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
        this.loadedData = null;
        this.cpDirty = false;

        if (!pipelineId) {
            return;
        }

        const checkpoint = await this.checkpointService.getByPipeline(ctx, pipelineId);
        this.cpData = deepClone((checkpoint?.data ?? {}) as CheckpointData);
        this.loadedData = deepClone(this.cpData);
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

        const loadedData = this.loadedData ?? {};
        const currentData = this.cpData;
        const keys = new Set([
            ...Object.keys(loadedData),
            ...Object.keys(currentData),
        ]);
        await this.checkpointService.updateForPipeline(ctx, pipelineId, persisted => {
            const merged = { ...persisted } as CheckpointData;
            for (const key of keys) {
                if (isDeepStrictEqual(loadedData[key], currentData[key])) continue;
                if (key in currentData) {
                    merged[key] = deepClone(currentData[key]);
                } else {
                    delete merged[key];
                }
            }
            return merged;
        });
        this.loadedData = deepClone(currentData);
        this.cpDirty = false;
    }
}
