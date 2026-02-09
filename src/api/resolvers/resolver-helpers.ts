import { Logger, TransactionalConnection, RequestContext, ID, VendureEntity } from '@vendure/core';
import { DeletionResponse, DeletionResult } from '@vendure/common/lib/generated-types';
import { Type } from '@vendure/common/lib/shared-types';

/**
 * Generic delete helper for entity resolvers.
 * Loads the entity by ID, removes it, and returns a DeletionResponse.
 */
export async function deleteEntity<T extends VendureEntity>(
    connection: TransactionalConnection,
    ctx: RequestContext,
    entityClass: Type<T>,
    id: ID,
    entityName: string,
): Promise<DeletionResponse> {
    const entity = await connection.getEntityOrThrow(ctx, entityClass, id);
    const repo = connection.getRepository(ctx, entityClass);
    try {
        await repo.remove(entity);
        return { result: DeletionResult.DELETED };
    } catch (e) {
        Logger.error(
            `Failed to delete ${entityName}: ${e instanceof Error ? e.message : String(e)}`,
            'DataHub',
        );
        return { result: DeletionResult.NOT_DELETED, message: `Failed to delete ${entityName} due to an internal error` };
    }
}
