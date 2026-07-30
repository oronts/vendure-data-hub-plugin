import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import {
    createPinnedLookup,
    resolveSafeRemoteAddress,
} from './remote-host-security.utils';
import { createPinnedS3RequestHandler } from './s3-request-handler.utils';

vi.mock('./remote-host-security.utils', async importOriginal => ({
    ...await importOriginal<typeof import('./remote-host-security.utils')>(),
    createPinnedLookup: vi.fn(() => vi.fn()),
    resolveSafeRemoteAddress: vi.fn(),
}));

describe('createPinnedS3RequestHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uses the validated endpoint host for an HTTP transport', async () => {
        vi.mocked(resolveSafeRemoteAddress).mockResolvedValue({
            hostname: 'objects.example.com',
            address: '203.0.113.10',
            family: 4,
        });

        const handler = await createPinnedS3RequestHandler(
            'http://objects.example.com/storage/v1',
        );

        expect(handler).toBeInstanceOf(NodeHttpHandler);
        expect(resolveSafeRemoteAddress).toHaveBeenCalledWith('objects.example.com');
        expect(createPinnedLookup).toHaveBeenCalledWith({
            hostname: 'objects.example.com',
            address: '203.0.113.10',
            family: 4,
        });
        handler?.destroy();
    });

    it('does not replace the standard AWS transport without a custom endpoint', async () => {
        await expect(createPinnedS3RequestHandler(undefined)).resolves.toBeUndefined();
        expect(resolveSafeRemoteAddress).not.toHaveBeenCalled();
    });
});
