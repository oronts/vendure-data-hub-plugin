import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HTTP } from '../constants/defaults/http-defaults';
import {
    createPinnedAddressLookup,
    resolveSafeRemoteAddresses,
} from './remote-host-security.utils';
import { createPinnedAwsRequestHandler } from './aws-request-handler.utils';

vi.mock('./remote-host-security.utils', async importOriginal => ({
    ...await importOriginal<typeof import('./remote-host-security.utils')>(),
    createPinnedAddressLookup: vi.fn(() => vi.fn()),
    resolveSafeRemoteAddresses: vi.fn(),
}));

describe('createPinnedAwsRequestHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('pins every validated address and bounds an HTTP transport', async () => {
        const remotes = [
            { hostname: 'objects.example.com', address: '203.0.113.10', family: 4 },
            { hostname: 'objects.example.com', address: '2001:db8::10', family: 6 },
        ] as const;
        vi.mocked(resolveSafeRemoteAddresses).mockResolvedValue(remotes);

        const handler = await createPinnedAwsRequestHandler(
            'http://objects.example.com/storage/v1',
        );

        expect(handler).toBeInstanceOf(NodeHttpHandler);
        expect(resolveSafeRemoteAddresses).toHaveBeenCalledWith('objects.example.com');
        expect(createPinnedAddressLookup).toHaveBeenCalledWith(remotes);
        const resolvedConfig = await (
            handler as unknown as {
                configProvider: Promise<Record<string, unknown>>;
            }
        ).configProvider;
        expect(resolvedConfig).toMatchObject({
            connectionTimeout: HTTP.CONNECTION_TEST_TIMEOUT_MS,
            socketTimeout: HTTP.TIMEOUT_MS,
        });
        handler?.destroy();
    });

    it('rejects endpoint credentials before DNS resolution', async () => {
        await expect(createPinnedAwsRequestHandler(
            'https://user:password@objects.example.com',
        )).rejects.toThrow('must not contain URL credentials');
        expect(resolveSafeRemoteAddresses).not.toHaveBeenCalled();
    });

    it('does not replace the standard AWS transport without a custom endpoint', async () => {
        await expect(createPinnedAwsRequestHandler(undefined)).resolves.toBeUndefined();
        expect(resolveSafeRemoteAddresses).not.toHaveBeenCalled();
    });
});
