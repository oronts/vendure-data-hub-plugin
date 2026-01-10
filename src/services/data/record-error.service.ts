import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { DataHubRecordError } from '../../entities/data';
import { PipelineRun } from '../../entities/pipeline';
import { HookService } from '../events/hook.service';
import { DomainEventsService } from '../events/domain-events.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { LOGGER_CONTEXTS } from '../../constants/index';

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
        payload: any,
    ): Promise<DataHubRecordError> {
        const repo = this.connection.getRepository(ctx, DataHubRecordError);
        const run = await this.connection.getEntityOrThrow(ctx, PipelineRun, runId);
        const entity = await repo.save(
            new DataHubRecordError({ run, stepKey, message, payload, deadLetter: false }),
        );
        try {
            const def = (run as any)?.pipeline?.definition ?? (await this.connection.getRepository(ctx, PipelineRun).findOne({ where: { id: runId }, relations: { pipeline: true } } as any))?.pipeline?.definition;
            if (def) {
                await this.hooks.run(ctx, def as any, 'onError', undefined as any, payload as any, runId);
            }
        } catch (error) {
            this.logger.warn('Failed to run onError hook', { runId, stepKey, error: (error as Error)?.message });
        }
        try {
            this.events.publish('RecordRejected', { runId, stepKey, message });
        } catch (error) {
            this.logger.warn('Failed to publish RecordRejected event', { runId, stepKey, error: (error as Error)?.message });
        }
        return entity;
    }

    listByRun(ctx: RequestContext, runId: ID): Promise<DataHubRecordError[]> {
        return this.connection.getRepository(ctx, DataHubRecordError).find({
            where: { run: { id: runId } as any },
            order: { createdAt: 'ASC' as any },
        } as any);
    }

    async getById(ctx: RequestContext, id: ID): Promise<DataHubRecordError | null> {
        return this.connection.getRepository(ctx, DataHubRecordError).findOne({ where: { id } });
    }

    async listDeadLetters(ctx: RequestContext): Promise<DataHubRecordError[]> {
        return this.connection.getRepository(ctx, DataHubRecordError).find({ where: { deadLetter: true } as any, order: { createdAt: 'ASC' as any } as any } as any);
    }

    async markDeadLetter(ctx: RequestContext, id: ID, value: boolean): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, DataHubRecordError);
        const ent = await this.connection.getEntityOrThrow(ctx, DataHubRecordError, id);
        ent.deadLetter = value;
        await repo.save(ent, { reload: false });
        try {
            const run = await this.connection.getRepository(ctx, PipelineRun).findOne({ where: { id: (ent as any).run?.id }, relations: { pipeline: true } } as any);
            const def = (run as any)?.pipeline?.definition;
            if (def) {
                await this.hooks.run(ctx, def as any, value ? 'onDeadLetter' : 'onRetry', undefined as any, ent.payload as any, run?.id);
            }
        } catch (error) {
            this.logger.warn(`Failed to run ${value ? 'onDeadLetter' : 'onRetry'} hook`, {
                recordErrorId: id,
                stepKey: ent.stepKey,
                error: (error as Error)?.message,
            });
        }
        if (value) {
            try {
                this.events.publish('RecordDeadLettered', { id: ent.id, stepKey: ent.stepKey });
            } catch (error) {
                this.logger.warn('Failed to publish RecordDeadLettered event', {
                    recordErrorId: ent.id,
                    stepKey: ent.stepKey,
                    error: (error as Error)?.message,
                });
            }
        }
        return true;
    }
}
