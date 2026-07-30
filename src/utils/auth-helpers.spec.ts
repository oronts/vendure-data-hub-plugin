import { describe, expect, it, vi } from 'vitest';
import { ConnectionAuthType, HTTP_HEADERS } from '../constants';
import { applyAuthentication } from './auth-helpers';

describe('applyAuthentication', () => {
    it('resolves configured bearer secrets', async () => {
        const headers: Record<string, string> = {};
        const resolver = vi.fn(async () => 'resolved-token');

        await applyAuthentication(headers, {
            type: ConnectionAuthType.BEARER,
            secretCode: 'api-token',
        }, resolver);

        expect(resolver).toHaveBeenCalledWith('api-token');
        expect(headers[HTTP_HEADERS.AUTHORIZATION]).toBe('Bearer resolved-token');
    });

    it('rejects unavailable configured secrets without modifying headers', async () => {
        const headers: Record<string, string> = {};

        await expect(applyAuthentication(headers, {
            type: ConnectionAuthType.BEARER,
            secretCode: 'missing-token',
        }, async () => undefined)).rejects.toThrow('empty or unavailable');

        expect(headers).toEqual({});
    });

    it('rejects configured secret references when no resolver exists', async () => {
        await expect(applyAuthentication({}, {
            type: ConnectionAuthType.API_KEY,
            secretCode: 'api-key',
        })).rejects.toThrow('cannot resolve');
    });

    it('rejects API key headers that can control request routing', async () => {
        await expect(applyAuthentication({}, {
            type: ConnectionAuthType.API_KEY,
            secretCode: 'api-key',
            headerName: 'Host',
        }, async () => 'resolved-key')).rejects.toThrow('headerName is invalid');
    });

    it('requires complete basic credentials', async () => {
        await expect(applyAuthentication({}, {
            type: ConnectionAuthType.BASIC,
            username: 'service-user',
        })).rejects.toThrow('requires password secretCode');
    });

    it('resolves basic username and password secrets independently', async () => {
        const headers: Record<string, string> = {};
        const values: Record<string, string> = {
            username: 'service-user',
            password: 'service-password',
        };

        await applyAuthentication(headers, {
            type: ConnectionAuthType.BASIC,
            usernameSecretCode: 'username',
            secretCode: 'password',
        }, async code => values[code]);

        const encoded = Buffer.from('service-user:service-password').toString('base64');
        expect(headers[HTTP_HEADERS.AUTHORIZATION]).toBe(`Basic ${encoded}`);
    });

    it('rejects authentication modes unsupported by HTTP connections', async () => {
        await expect(applyAuthentication({}, {
            type: ConnectionAuthType.OAUTH2,
        })).rejects.toThrow('Unsupported connection authentication type');
    });
});
