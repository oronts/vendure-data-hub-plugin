import { describe, expect, it } from 'vitest';
import { ConnectionAuthType } from '../../constants';
import { destinationSchema } from '../../api/schema/destination.schema';
import { sanitizeDestinationConfig } from './destination-config.sanitizer';
import { parseDestinationConfig } from './destination-config.validation';
import type { HTTPDestinationConfig } from './destination.types';

const baseHttpDestination = {
    id: 'partner-http',
    name: 'Partner HTTP',
    type: 'HTTP',
    url: 'https://partner.example.com/import',
} as const;

describe('destination credential configuration', () => {
    it.each([
        {
            ...baseHttpDestination,
            password: 'plaintext',
        },
        {
            ...baseHttpDestination,
            authConfig: { token: 'plaintext' },
        },
        {
            id: 'aws',
            name: 'AWS',
            type: 'S3',
            bucket: 'catalog',
            region: 'eu-central-1',
            accessKeyId: 'AKIA_PLAINTEXT',
            secretAccessKey: 'plaintext',
        },
        {
            id: 'smtp',
            name: 'SMTP',
            type: 'EMAIL',
            to: ['ops@example.com'],
            subject: 'Export',
            smtp: {
                host: 'smtp.example.com',
                port: 587,
                auth: { user: 'mailer', pass: 'plaintext' },
            },
        },
    ])('rejects plaintext credential fields before storage', input => {
        expect(() => parseDestinationConfig(input)).toThrow(
            /plaintext credentials|does not support field/,
        );
    });

    it('rejects prototype-bearing and prototype-key input', () => {
        const polluted = Object.create({ password: 'inherited' }) as Record<string, unknown>;
        Object.assign(polluted, baseHttpDestination);
        expect(() => parseDestinationConfig(polluted)).toThrow('must be a plain object');

        const dangerous = JSON.parse(
            '{"id":"http","name":"HTTP","type":"HTTP","url":"https://example.com","__proto__":{"token":"x"}}',
        ) as unknown;
        expect(() => parseDestinationConfig(dangerous)).toThrow(
            'Unsafe destination configuration key',
        );
    });

    it('rejects credentials embedded in URLs and static headers', () => {
        expect(() => parseDestinationConfig({
            ...baseHttpDestination,
            url: 'https://user:pass@partner.example.com/import',
        })).toThrow('cannot contain embedded credentials');

        expect(() => parseDestinationConfig({
            ...baseHttpDestination,
            headers: { Authorization: 'Bearer plaintext' },
        })).toThrow(/plaintext credentials|secret-backed authentication/);
    });

    it('accepts canonical Secret Code backed authentication', () => {
        expect(parseDestinationConfig({
            ...baseHttpDestination,
            auth: {
                type: ConnectionAuthType.BASIC,
                usernameSecretCode: 'partner-user',
                secretCode: 'partner-password',
            },
        })).toEqual({
            ...baseHttpDestination,
            enabled: undefined,
            method: undefined,
            headers: undefined,
            headerSecretCodes: undefined,
            auth: {
                type: ConnectionAuthType.BASIC,
                usernameSecretCode: 'partner-user',
                secretCode: 'partner-password',
                username: undefined,
                headerName: undefined,
            },
        });
    });

    it('accepts sensitive headers only as Secret Code references', () => {
        expect(parseDestinationConfig({
            ...baseHttpDestination,
            headers: { 'X-Tenant': 'catalog' },
            headerSecretCodes: {
                Authorization: 'partner-token',
                'X-Private-Token': 'partner-private-token',
            },
        })).toMatchObject({
            headers: { 'X-Tenant': 'catalog' },
            headerSecretCodes: {
                Authorization: 'partner-token',
                'X-Private-Token': 'partner-private-token',
            },
        });
    });

    it('rejects duplicate static, secret-backed, and auth header sources', () => {
        expect(() => parseDestinationConfig({
            ...baseHttpDestination,
            headers: { 'X-Tenant': 'catalog' },
            headerSecretCodes: { 'x-tenant': 'tenant-secret' },
        })).toThrow('both headers and headerSecretCodes');

        expect(() => parseDestinationConfig({
            ...baseHttpDestination,
            headerSecretCodes: { Authorization: 'partner-token' },
            auth: {
                type: ConnectionAuthType.BEARER,
                secretCode: 'other-token',
            },
        })).toThrow('both auth and headerSecretCodes');
    });

    it.each([
        {
            id: 's3',
            name: 'S3',
            type: 'S3',
            bucket: 'catalog',
            region: 'eu-central-1',
            accessKeyIdSecretCode: 'aws-access-key',
            secretAccessKeySecretCode: 'aws-secret-key',
        },
        {
            id: 'sftp',
            name: 'SFTP',
            type: 'SFTP',
            host: 'sftp.example.com',
            username: 'catalog',
            privateKeySecretCode: 'sftp-private-key',
            passphraseSecretCode: 'sftp-passphrase',
            remotePath: '/exports',
        },
        {
            id: 'ftp',
            name: 'FTP',
            type: 'FTP',
            host: 'ftp.example.com',
            username: 'catalog',
            passwordSecretCode: 'ftp-password',
            remotePath: '/exports',
        },
        {
            id: 'email',
            name: 'Email',
            type: 'EMAIL',
            to: ['ops@example.com'],
            subject: 'Catalog',
            smtp: {
                host: 'smtp.example.com',
                port: 587,
                usernameSecretCode: 'smtp-username',
                passwordSecretCode: 'smtp-password',
            },
        },
        {
            id: 'local',
            name: 'Local',
            type: 'LOCAL',
            directory: 'catalog',
        },
    ])('accepts the $type Secret Code contract', input => {
        const parsed = parseDestinationConfig(input);
        expect(parsed.type).toBe(input.type);
        expect(JSON.stringify(parsed)).not.toMatch(
            /"password"|"privateKey"|"passphrase"|"secretAccessKey"|"accessKeyId":/,
        );
    });

    it('removes legacy raw fields and sensitive static headers from output', () => {
        const legacy = {
            ...baseHttpDestination,
            auth: {
                type: ConnectionAuthType.BEARER,
                secretCode: 'partner-token',
            },
            headers: {
                'X-Tenant': 'catalog',
                Authorization: 'Bearer legacy-token',
            },
            authConfig: { token: 'legacy-token' },
            password: 'legacy-password',
        } as unknown as HTTPDestinationConfig;

        const sanitized = sanitizeDestinationConfig(legacy);
        expect(sanitized).toMatchObject({
            auth: { secretCode: 'partner-token' },
            headers: { 'X-Tenant': 'catalog' },
        });
        expect(JSON.stringify(sanitized)).not.toContain('legacy-token');
        expect(JSON.stringify(sanitized)).not.toContain('legacy-password');
        expect(sanitized).not.toHaveProperty('authConfig');
    });

    it('does not expose plaintext credential fields in GraphQL', () => {
        expect(destinationSchema).toContain('accessKeyIdSecretCode: String');
        expect(destinationSchema).toContain('passwordSecretCode: String');
        expect(destinationSchema).toContain('secretCode: String');
        expect(destinationSchema).toContain('hostKeyFingerprintSecretCode: String');
        expect(destinationSchema).toContain('headerSecretCodes: JSON');
        expect(destinationSchema).not.toMatch(/\n\s+(accessKeyId|secretAccessKey|password|privateKey|passphrase): String/);
        expect(destinationSchema).not.toContain('authConfig: JSON');
    });
});
