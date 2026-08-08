import { RequestContext } from '@vendure/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionAuthType, StepType } from '../../constants';
import { SecretService } from '../../services/config/secret.service';
import { DataHubLoggerFactory } from '../../services/logger';
import { RestPostHandler } from './loaders/rest-handler';

const ctx = {} as RequestContext;
const loggerFactory = {
    createLogger: vi.fn(() => ({
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    })),
} as unknown as DataHubLoggerFactory;

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('outbound authentication boundaries', () => {
    it('does not fetch when a REST loader HMAC configuration is incomplete', async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        const secrets = {
            resolve: vi.fn(),
        } as unknown as SecretService;
        const handler = new RestPostHandler(secrets, loggerFactory);

        await expect(handler.execute(ctx, {
            key: 'rest-load',
            type: StepType.LOAD,
            config: {
                adapterCode: 'restPost',
                endpoint: 'https://example.com/products',
                auth: ConnectionAuthType.HMAC,
                hmacHeader: 'x-signature',
            },
        }, [{ sku: 'SKU-1' }])).rejects.toThrow('requires hmacSecretCode and hmacHeader');

        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
