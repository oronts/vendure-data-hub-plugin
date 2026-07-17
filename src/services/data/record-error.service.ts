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
        const run = await this.connection.getEntityOrThrow(ctx, PipelineRun, runId);
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
        return this.connection.getRepository(ctx, DataHubRecordError).findOne({
            where: { id },
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
        const pageSize = parseRecordErrorPageSize(options.first);
        const cursor = decodeRecordErrorCursor(options.after);
        const where: FindOptionsWhere<DataHubRecordError> | FindOptionsWhere<DataHubRecordError>[] = cursor
            ? [
                { ...baseWhere, createdAt: LessThan(cursor.createdAt) },
                { ...baseWhere, createdAt: Equal(cursor.createdAt), id: LessThan(cursor.id) },
            ]
            : baseWhere;
        const [rows, totalItems] = await Promise.all([
            repository.find({
                where,
                relations: { run: { pipeline: true } },
                order: { createdAt: SortOrder.DESC, id: SortOrder.DESC },
                take: pageSize + 1,
            }),
            repository.count({ where: baseWhere }),
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
