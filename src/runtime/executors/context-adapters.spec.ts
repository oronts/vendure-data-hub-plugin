import { describe, expect, it, vi } from 'vitest';
import { ConnectionType } from '../../constants/enums';
import { ConnectionService } from '../../services/config/connection.service';
import { createConnectionsAdapter } from './context-adapters';

describe('createConnectionsAdapter', () => {
    it('uses runtime-resolved connection configuration', async () => {
        const connectionService = {
            getRuntimeByCode: vi.fn().mockResolvedValue({
                code: 'erp',
                type: ConnectionType.HTTP,
                config: { baseUrl: 'https://erp.internal' },
            }),
            getByCode: vi.fn(() => {
                throw new Error('raw connection access is not allowed at runtime');
            }),
        } as unknown as ConnectionService;
        const resolver = createConnectionsAdapter(connectionService, {} as never);

        await expect(resolver.getRequired('erp')).resolves.toEqual({
            code: 'erp',
            type: ConnectionType.HTTP,
            config: { baseUrl: 'https://erp.internal' },
        });
        expect(connectionService.getRuntimeByCode).toHaveBeenCalledWith({}, 'erp');
        expect(connectionService.getByCode).not.toHaveBeenCalled();
    });

    it('distinguishes optional and required missing connections', async () => {
        const connectionService = {
            getRuntimeByCode: vi.fn().mockResolvedValue(null),
        } as unknown as ConnectionService;
        const resolver = createConnectionsAdapter(connectionService, {} as never);

        await expect(resolver.get('missing')).resolves.toBeUndefined();
        await expect(resolver.getRequired('missing')).rejects.toThrow('Connection not found: missing');
    });
});
