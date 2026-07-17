import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { DataHubRecordRetryAudit, DataHubRecordError } from '../../entities/data';
import { PAGINATION } from '../../constants';
import { SortOrder } from '../../constants/enums';
import type { JsonObject } from '../../types/index';
import type { FindOptionsOrder, FindOptionsWhere } from 'typeorm';

@Injectable()
export class RecordRetryAuditService {
    constructor(private connection: TransactionalConnection) {}

    async record(
        ctx: RequestContext,
        error: DataHubRecordError,
        previousPayload: JsonObject,
        patch: JsonObject,
        resultingPayload: JsonObject,
    ): Promise<DataHubRecordRetryAudit> {
        const repo = this.connection.getRepository(ctx, DataHubRecordRetryAudit);
        const audit = new DataHubRecordRetryAudit();
        audit.error = error;
        audit.userId = ctx.activeUserId != null ? String(ctx.activeUserId) : null;
        audit.previousPayload = previousPayload;
        audit.patch = patch;
        audit.resultingPayload = resultingPayload;
        return repo.save(audit);
    }

    listByError(
        ctx: RequestContext,
        errorId: ID,
        limit: number = PAGINATION.LIST_PAGE_SIZE,
    ): Promise<DataHubRecordRetryAudit[]> {
        if (!Number.isInteger(limit) || limit <= 0 || limit > PAGINATION.MAX_QUERY_LIMIT) {
            throw new Error(`limit must be between 1 and ${PAGINATION.MAX_QUERY_LIMIT}`);
        }
        const repo = this.connection.getRepository(ctx, DataHubRecordRetryAudit);
        const where: FindOptionsWhere<DataHubRecordRetryAudit> = { error: { id: errorId } };
        const order: FindOptionsOrder<DataHubRecordRetryAudit> = { createdAt: SortOrder.DESC };
        return repo.find({
            where,
            order,
            relations: { error: { run: { pipeline: true } } },
            take: limit,
        });
    }
}
