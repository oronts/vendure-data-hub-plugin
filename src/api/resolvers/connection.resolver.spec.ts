import { describe, expect, it, vi } from 'vitest';
import type { ListQueryBuilder, RequestContext } from '@vendure/core';
import type { ConnectionService } from '../../services/config/connection.service';
import type { DataHubLoggerFactory } from '../../services/logger';
import { ResourceInUseError } from '../../services/config/resource-reference.service';
import { DataHubConnectionAdminResolver } from './connection.resolver';

function createResolver(deleteConnection: ReturnType<typeof vi.fn>) {
    const logger = { error: vi.fn() };
    const resolver = new DataHubConnectionAdminResolver(
        {} as ListQueryBuilder,
        { delete: deleteConnection } as unknown as ConnectionService,
        {
            createLogger: vi.fn(() => logger),
        } as unknown as DataHubLoggerFactory,
    );
    return { resolver, logger };
}

describe('DataHubConnectionAdminResolver deletion', () => {
    const ctx = {} as RequestContext;

    it('returns an actionable response when the connection does not exist', async () => {
        const deleteConnection = vi.fn().mockResolvedValue(false);
        const { resolver } = createResolver(deleteConnection);

        await expect(resolver.deleteDataHubConnection(ctx, { id: 999 })).resolves.toEqual({
            result: 'NOT_DELETED',
            message: 'Connection not found',
        });
    });

    it('returns DELETED without an error message after successful deletion', async () => {
        const deleteConnection = vi.fn().mockResolvedValue(true);
        const { resolver } = createResolver(deleteConnection);

        await expect(resolver.deleteDataHubConnection(ctx, { id: 1 })).resolves.toEqual({
            result: 'DELETED',
        });
    });

    it('returns the dependency reason when the connection is in use', async () => {
        const deleteConnection = vi.fn().mockRejectedValue(
            new ResourceInUseError('Connection is used by pipeline supplier-import'),
        );
        const { resolver, logger } = createResolver(deleteConnection);

        await expect(resolver.deleteDataHubConnection(ctx, { id: 1 })).resolves.toEqual({
            result: 'NOT_DELETED',
            message: 'Connection is used by pipeline supplier-import',
        });
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('hides internal deletion errors and records the failure', async () => {
        const deleteConnection = vi.fn().mockRejectedValue(new Error('database unavailable'));
        const { resolver, logger } = createResolver(deleteConnection);

        await expect(resolver.deleteDataHubConnection(ctx, { id: 1 })).resolves.toEqual({
            result: 'NOT_DELETED',
            message: 'Failed to delete connection due to an internal error',
        });
        expect(logger.error).toHaveBeenCalledWith(
            'Failed to delete connection: database unavailable',
        );
    });
});
