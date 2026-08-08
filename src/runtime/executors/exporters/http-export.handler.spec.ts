import type { RequestContext } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SecretService } from '../../../services/config/secret.service';
import type { DataHubLogger } from '../../../services/logger';
import { secureFetch } from '../../../utils/secure-fetch.utils';
import { httpExportHandler } from './http-export.handler';

vi.mock('../../../utils/secure-fetch.utils', () => ({
    secureFetch: vi.fn(),
}));

const records = [{ id: 'one' }, { id: 'two' }];

function createParams(config: Record<string, unknown>) {
    return {
        ctx: {} as RequestContext,
        stepKey: 'http-export',
        config: config as never,
        records,
        onRecordError: vi.fn(async () => undefined),
        secretService: {
            resolve: vi.fn(async () => null),
        } as unknown as SecretService,
        logger: {
            debug: vi.fn(),
            warn: vi.fn(),
        } as unknown as DataHubLogger,
    };
}

describe('HTTP export execution contract', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(secureFetch).mockResolvedValue(new Response('{}', { status: 200 }));
    });

    it.each([
        ['batchSize', Number.POSITIVE_INFINITY],
        ['batchSize', 1.5],
        ['batchSize', '100'],
        ['timeoutMs', 0],
        ['timeoutMs', Number.NaN],
        ['retryCount', 1.5],
        ['retryCount', 11],
        ['retryDelayMs', -1],
        ['maxRetryDelayMs', Number.POSITIVE_INFINITY],
        ['backoffMultiplier', 0],
        ['method', 42],
    ])('rejects invalid %s before making a request', async (field, value) => {
        const params = createParams({
            url: 'https://api.example.com/import',
            [field]: value,
        });

        await expect(httpExportHandler(params)).resolves.toEqual({ ok: 0, fail: 2 });
        expect(params.onRecordError).toHaveBeenCalledWith(
            'http-export',
            expect.stringContaining(`HTTP export ${field}`),
            { _configError: true, recordCount: 2 },
        );
        expect(secureFetch).not.toHaveBeenCalled();
    });

    it('rejects a maximum retry delay below the initial delay', async () => {
        const params = createParams({
            url: 'https://api.example.com/import',
            retryDelayMs: 1_000,
            maxRetryDelayMs: 999,
        });

        await expect(httpExportHandler(params)).resolves.toEqual({ ok: 0, fail: 2 });
        expect(params.onRecordError).toHaveBeenCalledWith(
            'http-export',
            'HTTP export maxRetryDelayMs cannot be less than retryDelayMs',
            { _configError: true, recordCount: 2 },
        );
        expect(secureFetch).not.toHaveBeenCalled();
    });

    it('rejects conflicting authentication modes', async () => {
        const params = createParams({
            url: 'https://api.example.com/import',
            bearerTokenSecretCode: 'bearer-token',
            basicSecretCode: 'basic-credentials',
        });

        await expect(httpExportHandler(params)).resolves.toEqual({ ok: 0, fail: 2 });
        expect(params.onRecordError).toHaveBeenCalledWith(
            'http-export',
            'HTTP export cannot configure both bearerTokenSecretCode and basicSecretCode',
            { _configError: true, recordCount: 2 },
        );
        expect(secureFetch).not.toHaveBeenCalled();
    });

    it('uses the validated batch size for sequential requests', async () => {
        const params = createParams({
            url: 'https://api.example.com/import',
            batchSize: 1,
        });

        await expect(httpExportHandler(params)).resolves.toEqual({ ok: 2, fail: 0 });
        expect(secureFetch).toHaveBeenCalledTimes(2);
    });
});
