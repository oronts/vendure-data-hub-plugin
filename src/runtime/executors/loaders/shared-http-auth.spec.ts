import { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionAuthType, HTTP_HEADERS } from '../../../constants';
import { SecretService } from '../../../services/config/secret.service';
import { resolveAuthHeaders } from './shared-http-auth';

describe('resolveAuthHeaders', () => {
    const ctx = {} as RequestContext;

    it('rejects bearer auth without a secret reference', async () => {
        const secrets = { resolve: vi.fn() } as unknown as SecretService;

        await expect(resolveAuthHeaders(ctx, secrets, {
            auth: ConnectionAuthType.BEARER,
        }, {})).rejects.toThrow('requires bearerTokenSecretCode');
    });

    it('rejects unavailable bearer secrets', async () => {
        const secrets = { resolve: vi.fn(async () => null) } as unknown as SecretService;

        await expect(resolveAuthHeaders(ctx, secrets, {
            auth: ConnectionAuthType.BEARER,
            bearerTokenSecretCode: 'missing',
        }, {})).rejects.toThrow('empty or unavailable');
    });

    it('rejects malformed basic secrets', async () => {
        const secrets = { resolve: vi.fn(async () => 'username-only') } as unknown as SecretService;

        await expect(resolveAuthHeaders(ctx, secrets, {
            auth: ConnectionAuthType.BASIC,
            basicSecretCode: 'basic-auth',
        }, {})).rejects.toThrow('non-empty username and password');
    });

    it('adds valid basic authentication without mutating base headers', async () => {
        const secrets = { resolve: vi.fn(async () => 'user:password') } as unknown as SecretService;
        const baseHeaders = { 'x-request-id': 'request-1' };

        const headers = await resolveAuthHeaders(ctx, secrets, {
            auth: ConnectionAuthType.BASIC,
            basicSecretCode: 'basic-auth',
        }, baseHeaders);

        expect(baseHeaders).toEqual({ 'x-request-id': 'request-1' });
        expect(headers[HTTP_HEADERS.AUTHORIZATION]).toBe(`Basic ${Buffer.from('user:password').toString('base64')}`);
    });
});
