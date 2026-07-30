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
import { Equal, LessThan } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import {
    decodeRecordErrorCursor,
    encodeRecordErrorCursor,
    parseRecordErrorPageSize,
} from './record-error-page';
import type { RecordErrorPage, RecordErrorPageOptions } from './record-error-page';
import { getActivePipelineRunChannelId } from '../pipeline/pipeline-run-channel';

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
        stackTrace?: string,
    ): Promise<DataHubRecordError> {
        const repo = this.connection.getRepository(ctx, DataHubRecordError);
        const channelId = getActivePipelineRunChannelId(ctx);
        const run = await this.connection.getRepository(ctx, PipelineRun).findOne({
            where: { id: runId, channelId },
        });
        if (!run) {
            throw new Error(`Pipeline run not found: ${String(runId)}`);
        }
        const errorEntity = new DataHubRecordError();
        errorEntity.run = run;
        errorEntity.runId = runId;
        errorEntity.stepKey = stepKey;
        errorEntity.message = message;
        errorEntity.payload = payload;
        errorEntity.deadLetter = false;
        if (stackTrace) {
            errorEntity.stackTrace = stackTrace;
        }
        const entity = await repo.save(errorEntity);
        try {
            this.events.publish('RECORD_REJECTED', { runId, stepKey, message });
        } catch (error) {
            this.logger.warn('Failed to publish RECORD_REJECTED event', { runId, stepKey, error: getErrorMessage(error) });
        }
        return entity;
    }

    listByRun(
        ctx: RequestContext,
        runId: ID,
        options: RecordErrorPageOptions = {},
    ): Promise<RecordErrorPage> {
        return this.listPage(ctx, { runId }, options);
    }

    async getById(ctx: RequestContext, id: ID): Promise<DataHubRecordError | null> {
        const channelId = getActivePipelineRunChannelId(ctx);
        return this.connection.getRepository(ctx, DataHubRecordError).findOne({
            where: { id, run: { channelId } },
            relations: { run: { pipeline: true } },
        });
    }

    listDeadLetters(
        ctx: RequestContext,
        options: RecordErrorPageOptions = {},
    ): Promise<RecordErrorPage> {
        return this.listPage(ctx, { deadLetter: true }, options);
    }

    private async listPage(
        ctx: RequestContext,
        baseWhere: FindOptionsWhere<DataHubRecordError>,
        options: RecordErrorPageOptions,
    ): Promise<RecordErrorPage> {
        const repository = this.connection.getRepository(ctx, DataHubRecordError);
        const channelId = getActivePipelineRunChannelId(ctx);
        const scopedBaseWhere: FindOptionsWhere<DataHubRecordError> = {
            ...baseWhere,
            run: { channelId },
        };
        const pageSize = parseRecordErrorPageSize(options.first);
        const cursor = decodeRecordErrorCursor(options.after);
        const where: FindOptionsWhere<DataHubRecordError> | FindOptionsWhere<DataHubRecordError>[] = cursor
            ? [
                { ...scopedBaseWhere, createdAt: LessThan(cursor.createdAt) },
                { ...scopedBaseWhere, createdAt: Equal(cursor.createdAt), id: LessThan(cursor.id) },
            ]
            : scopedBaseWhere;
        const [rows, totalItems] = await Promise.all([
            repository.find({
                where,
                relations: { run: { pipeline: true } },
                order: { createdAt: SortOrder.DESC, id: SortOrder.DESC },
                take: pageSize + 1,
            }),
            repository.count({ where: scopedBaseWhere }),
        ]);
        const hasNextPage = rows.length > pageSize;
        const items = hasNextPage ? rows.slice(0, pageSize) : rows;
        return {
            items,
            totalItems,
            hasNextPage,
            endCursor: items.length > 0 ? encodeRecordErrorCursor(items[items.length - 1]) : null,
        };
    }

    async markDeadLetter(ctx: RequestContext, id: ID, value: boolean): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, DataHubRecordError);
        const ent = await this.getById(ctx, id);
        if (!ent) {
            throw new Error(`Record error not found: ${String(id)}`);
        }
        ent.deadLetter = value;
        await repo.save(ent, { reload: false });
        await this.runTransitionHook(
            ctx,
            ent,
            value ? HookStage.ON_DEAD_LETTER : HookStage.ON_RETRY,
        );
        if (value) {
            try {
                this.events.publish('RECORD_DEAD_LETTERED', {
                    id: ent.id,
                    runId: ent.runId,
                    stepKey: ent.stepKey,
                });
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

    async notifyRetry(ctx: RequestContext, record: DataHubRecordError): Promise<void> {
        await this.runTransitionHook(ctx, record, HookStage.ON_RETRY);
    }

    private async runTransitionHook(
        ctx: RequestContext,
        record: DataHubRecordError,
        stage: HookStage.ON_RETRY | HookStage.ON_DEAD_LETTER,
    ): Promise<void> {
        try {
            const channelId = getActivePipelineRunChannelId(ctx);
            const run = record.runId
                ? await this.connection.getRepository(ctx, PipelineRun).findOne({
                      where: { id: record.runId, channelId },
                      relations: { pipeline: true },
                  })
                : null;
            const definition = run?.definitionSnapshot;
            if (definition && run) {
                await this.hooks.run(
                    ctx,
                    definition,
                    stage,
                    undefined,
                    record.payload,
                    run.id,
                );
            } else if (run) {
                this.logger.warn(`Skipped ${stage} hook because the run has no immutable definition snapshot`, {
                    recordErrorId: record.id,
                    runId: run.id,
                });
            }
        } catch (error) {
            this.logger.warn(`Failed to run ${stage} hook`, {
                recordErrorId: record.id,
                stepKey: record.stepKey,
                error: getErrorMessage(error),
            });
        }
    }
}
