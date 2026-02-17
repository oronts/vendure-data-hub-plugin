import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { DataHubRecordError } from '../../entities/data';
import { PipelineRun } from '../../entities/pipeline';
import { HookService } from '../events/hook.service';
import { DomainEventsService } from '../events/domain-events.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { LOGGER_CONTEXTS, SortOrder, HookStage } from '../../constants/index';
import type { JsonObject } from '../../types/index';
import { getErrorMessage } from '../../utils/error.utils';

@Injectable()
export class RecordErrorService {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        private hooks: HookService,
        private events: DomainEventsService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.RECORD_ERROR_SERVICE ?? 'RecordErrorService');
    }

    async record(
        ctx: RequestContext,
        runId: ID,
        stepKey: string,
        message: string,
        payload: JsonObject,
    ): Promise<DataHubRecordError> {
        const repo = this.connection.getRepository(ctx, DataHubRecordError);
        const run = await this.connection.getEntityOrThrow(ctx, PipelineRun, runId);
        const errorEntity = new DataHubRecordError();
        errorEntity.run = run;
        errorEntity.runId = Number(runId);
        errorEntity.stepKey = stepKey;
        errorEntity.message = message;
        errorEntity.payload = payload;
        errorEntity.deadLetter = false;
        const entity = await repo.save(errorEntity);
        try {
            const runWithPipeline = await this.connection.getRepository(ctx, PipelineRun).findOne({
                where: { id: runId },
                relations: { pipeline: true },
            });
            const def = runWithPipeline?.pipeline?.definition;
            if (def) {
                await this.hooks.run(ctx, def, HookStage.ON_ERROR, undefined, payload, runId);
            }
        } catch (error) {
            this.logger.warn('Failed to run onError hook', { runId, stepKey, error: getErrorMessage(error) });
        }
        try {
            this.events.publish('RECORD_REJECTED', { runId, stepKey, message });
        } catch (error) {
            this.logger.warn('Failed to publish RECORD_REJECTED event', { runId, stepKey, error: getErrorMessage(error) });
        }
        return entity;
    }

    listByRun(ctx: RequestContext, runId: ID): Promise<DataHubRecordError[]> {
        return this.connection.getRepository(ctx, DataHubRecordError).find({
            where: { runId: Number(runId) },
            order: { createdAt: SortOrder.ASC },
        });
    }

    async getById(ctx: RequestContext, id: ID): Promise<DataHubRecordError | null> {
        return this.connection.getRepository(ctx, DataHubRecordError).findOne({ where: { id } });
    }

    async listDeadLetters(ctx: RequestContext): Promise<DataHubRecordError[]> {
        return this.connection.getRepository(ctx, DataHubRecordError).find({
            where: { deadLetter: true },
            order: { createdAt: SortOrder.ASC },
        });
    }

    async markDeadLetter(ctx: RequestContext, id: ID, value: boolean): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, DataHubRecordError);
        const ent = await this.connection.getEntityOrThrow(ctx, DataHubRecordError, id);
        ent.deadLetter = value;
        await repo.save(ent, { reload: false });
        try {
            const run = ent.runId
                ? await this.connection.getRepository(ctx, PipelineRun).findOne({
                      where: { id: ent.runId },
                      relations: { pipeline: true },
                  })
                : null;
            const def = run?.pipeline?.definition;
            if (def && run) {
                await this.hooks.run(ctx, def, value ? HookStage.ON_DEAD_LETTER : HookStage.ON_RETRY, undefined, ent.payload, run.id);
            }
        } catch (error) {
            this.logger.warn(`Failed to run ${value ? HookStage.ON_DEAD_LETTER : HookStage.ON_RETRY} hook`, {
                recordErrorId: id,
                stepKey: ent.stepKey,
                error: getErrorMessage(error),
            });
        }
        if (value) {
            try {
                this.events.publish('RECORD_DEAD_LETTERED', { id: ent.id, stepKey: ent.stepKey });
            } catch (error) {
                this.logger.warn('Failed to publish RECORD_DEAD_LETTERED event', {
                    recordErrorId: ent.id,
                    stepKey: ent.stepKey,
                    error: getErrorMessage(error),
                });
            }
        }
        return true;
    }
}
