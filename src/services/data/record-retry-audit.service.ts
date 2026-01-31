import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { DataHubRecordRetryAudit, DataHubRecordError } from '../../entities/data';
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

    listByError(ctx: RequestContext, errorId: ID): Promise<DataHubRecordRetryAudit[]> {
        const repo = this.connection.getRepository(ctx, DataHubRecordRetryAudit);
        const where: FindOptionsWhere<DataHubRecordRetryAudit> = { error: { id: errorId } };
        const order: FindOptionsOrder<DataHubRecordRetryAudit> = { createdAt: SortOrder.ASC };
        return repo.find({ where, order });
    }
}
