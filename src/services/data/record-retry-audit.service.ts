import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { DataHubRecordRetryAudit, DataHubRecordError } from '../../entities/data';

@Injectable()
export class RecordRetryAuditService {
    constructor(private connection: TransactionalConnection) {}

    async record(
        ctx: RequestContext,
        error: DataHubRecordError,
        previousPayload: any,
        patch: any,
        resultingPayload: any,
    ): Promise<DataHubRecordRetryAudit> {
        const repo = this.connection.getRepository(ctx, DataHubRecordRetryAudit);
        const audit = await repo.save(
            new DataHubRecordRetryAudit({
                error,
                userId: ctx.activeUserId != null ? String(ctx.activeUserId) : null,
                previousPayload,
                patch,
                resultingPayload,
            }),
        );
        return audit;
    }

    listByError(ctx: RequestContext, errorId: ID): Promise<DataHubRecordRetryAudit[]> {
        const repo = this.connection.getRepository(ctx, DataHubRecordRetryAudit);
        return repo.find({ where: { error: { id: errorId } as any }, order: { createdAt: 'ASC' } as any } as any);
    }
}
