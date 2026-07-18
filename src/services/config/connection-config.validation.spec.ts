import { describe, expect, it } from 'vitest';
import { ConnectionType } from '../../constants/enums';
import { CONNECTION_TYPE } from '../../../shared/constants';
import { CONNECTION_SCHEMAS } from '../../constants/connection-schemas';
import {
    assertConnectionConfig,
    parseConnectionType,
} from './connection-config.validation';

describe('connection configuration validation', () => {
    it('normalizes supported connection types', () => {
        expect(parseConnectionType(' postgres ')).toBe(ConnectionType.POSTGRES);
        expect(() => parseConnectionType('legacy')).toThrow('Invalid connection type');
    });

    it('exposes only connection types with registered runtime contracts', () => {
        const expected = [
            'CUSTOM',
            'FTP',
            'GRAPHQL',
            'HTTP',
            'MYSQL',
            'POSTGRES',
            'RABBITMQ',
            'REDIS',
            'REST',
            'S3',
            'SFTP',
            'SQS',
        ];

        expect(Object.values(ConnectionType).sort()).toEqual(expected);
        expect(Object.values(CONNECTION_TYPE).sort()).toEqual(expected);
        expect(CONNECTION_SCHEMAS.map(schema => schema.type).sort()).toEqual(expected);
    });

    it.each(['DATABASE', 'MSSQL', 'MONGODB'])('rejects removed %s connection types', type => {
        expect(() => parseConnectionType(type)).toThrow('Invalid connection type');
    });

    it('accepts secret references for database credentials', () => {
        expect(() => assertConnectionConfig(ConnectionType.POSTGRES, {
            host: 'database.internal',
            port: 5432,
            database: 'catalog',
            username: 'importer',
            passwordSecretCode: 'database-password',
            ssl: true,
        })).not.toThrow();
    });

    it('rejects plaintext and unknown database fields', () => {
        expect(() => assertConnectionConfig(ConnectionType.POSTGRES, {
            host: 'database.internal',
            port: 5432,
            database: 'catalog',
            username: 'importer',
            password: 'plaintext',
        })).toThrow(/does not support field|plaintext credentials/);
    });

    it('requires HTTP authentication to reference a secret', () => {
        expect(() => assertConnectionConfig(ConnectionType.HTTP, {
            baseUrl: 'https://erp.example.com',
            auth: { type: 'BEARER', token: 'plaintext' },
        })).toThrow(/does not support field|plaintext credentials/);
        expect(() => assertConnectionConfig(ConnectionType.HTTP, {
            baseUrl: 'https://erp.example.com',
            auth: { type: 'BEARER', secretCode: 'erp-token' },
        })).not.toThrow();
    });

    it('rejects credential-bearing default headers', () => {
        expect(() => assertConnectionConfig(ConnectionType.HTTP, {
            headers: { Authorization: 'Bearer plaintext' },
        })).toThrow(/plaintext credentials|secret-backed authentication/);
    });

    it('allows environment references but not plaintext secrets in custom connections', () => {
        expect(() => assertConnectionConfig(ConnectionType.CUSTOM, {
            config: { password: '${ERP_PASSWORD}' },
        })).not.toThrow();
        expect(() => assertConnectionConfig(ConnectionType.CUSTOM, {
            config: { password: 'plaintext' },
        })).toThrow('cannot store plaintext credentials');
    });

    it('rejects non-canonical HTTP authentication types before persistence', () => {
        expect(() => assertConnectionConfig(ConnectionType.HTTP, {
            auth: { type: 'bearer', secretCode: 'erp-token' },
        })).toThrow('must use canonical value "BEARER"');
    });

    it('validates SFTP host-key fingerprint Secret Code references', () => {
        const config = {
            host: 'sftp.example.com',
            port: 22,
            username: 'catalog',
            privateKeySecretCode: 'sftp-private-key',
            hostKeyFingerprintSecretCode: 'sftp-host-key',
        };
        expect(() => assertConnectionConfig(ConnectionType.SFTP, config)).not.toThrow();
        expect(() => assertConnectionConfig(ConnectionType.SFTP, {
            ...config,
            hostKeyFingerprintSecretCode: 'invalid code',
        })).toThrow('contains an invalid Secret Code');
    });

    it('accepts SQS account-based, custom-endpoint, and direct queue URL configurations', () => {
        expect(() => assertConnectionConfig(ConnectionType.SQS, {
            region: 'eu-central-1',
            accountId: '123456789012',
        })).not.toThrow();
        expect(() => assertConnectionConfig(ConnectionType.SQS, {
            region: 'eu-central-1',
            accountId: '123456789012',
            endpoint: 'https://sqs-compatible.example.com',
        })).not.toThrow();
        expect(() => assertConnectionConfig(ConnectionType.SQS, {
            region: 'eu-central-1',
            queueUrl: 'https://sqs.eu-central-1.amazonaws.com/123456789012/orders',
            accessKeyIdSecretCode: 'aws-access-key',
            secretAccessKeySecretCode: 'aws-secret-key',
        })).not.toThrow();
    });

    it('rejects SQS configs without a URL source or with partial credentials', () => {
        expect(() => assertConnectionConfig(ConnectionType.SQS, {
            region: 'eu-central-1',
        })).toThrow('require accountId or queueUrl');
        expect(() => assertConnectionConfig(ConnectionType.SQS, {
            region: 'eu-central-1',
            accountId: '123456789012',
            accessKeyIdSecretCode: 'aws-access-key',
        })).toThrow('must be configured together');
        expect(() => assertConnectionConfig(ConnectionType.SQS, {
            region: 'eu-central-1',
            queueUrl: 'file:///tmp/orders',
        })).toThrow('must use http or https');
    });
});
