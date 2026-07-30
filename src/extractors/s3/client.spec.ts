import { describe, expect, it, vi } from 'vitest';
import type { ExtractorContext } from '../../types';
import { buildS3ClientConfig } from './client';

function contextWithSecrets(values: Record<string, string | undefined>): ExtractorContext {
    return {
        secrets: {
            get: vi.fn(async (code: string) => values[code]),
        },
    } as unknown as ExtractorContext;
}

describe('buildS3ClientConfig', () => {
    it('uses the ambient AWS credential chain only when no static credentials are configured', async () => {
        const context = contextWithSecrets({});

        const result = await buildS3ClientConfig(context, {
            bucket: 'catalog-imports',
        });

        expect(result).toMatchObject({
            region: 'us-east-1',
        });
        expect(result).not.toHaveProperty('credentials');
        expect(context.secrets.get).not.toHaveBeenCalled();
    });

    it('resolves a complete static credential pair', async () => {
        const context = contextWithSecrets({
            access: ' access-key ',
            secret: ' secret-key ',
        });

        await expect(buildS3ClientConfig(context, {
            bucket: 'catalog-imports',
            accessKeyIdSecretCode: 'access',
            secretAccessKeySecretCode: 'secret',
        })).resolves.toMatchObject({
            credentials: {
                accessKeyId: 'access-key',
                secretAccessKey: 'secret-key',
            },
        });
    });

    it('rejects an incomplete configured credential pair', async () => {
        const context = contextWithSecrets({ access: 'access-key' });

        await expect(buildS3ClientConfig(context, {
            bucket: 'catalog-imports',
            accessKeyIdSecretCode: 'access',
        })).rejects.toThrow('require both Access Key ID and Secret Access Key Secret Codes');
    });

    it('rejects missing configured secrets instead of falling back to ambient credentials', async () => {
        const context = contextWithSecrets({ access: 'access-key' });

        await expect(buildS3ClientConfig(context, {
            bucket: 'catalog-imports',
            accessKeyIdSecretCode: 'access',
            secretAccessKeySecretCode: 'missing',
        })).rejects.toThrow('empty or unavailable');
    });
});
