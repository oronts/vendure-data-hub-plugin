import { describe, expect, it } from 'vitest';
import { ConnectionAuthType } from '../../../shared';
import { CONNECTION_TYPE } from '../../constants';
import type { ConnectionSchema } from '../../hooks/api/use-config-options';
import { validateConnectionConfigDraft } from './connection-config-validation';

const schemas: ConnectionSchema[] = [
    { type: 'HTTP', label: 'HTTP', fields: [], httpLike: true },
    { type: 'REST', label: 'REST', fields: [], httpLike: true },
    { type: 'GRAPHQL', label: 'GraphQL', fields: [], httpLike: true },
    {
        type: 'POSTGRES',
        label: 'PostgreSQL',
        fields: requiredDatabaseFields(),
    },
    {
        type: 'MYSQL',
        label: 'MySQL',
        fields: requiredDatabaseFields(),
    },
    {
        type: 'S3',
        label: 'S3',
        fields: [requiredText('bucket'), requiredText('region')],
    },
    {
        type: 'FTP',
        label: 'FTP',
        fields: requiredHostFields(),
    },
    {
        type: 'SFTP',
        label: 'SFTP',
        fields: requiredHostFields(),
    },
    {
        type: 'RABBITMQ',
        label: 'RabbitMQ',
        fields: [...requiredHostFields(), requiredSecret('passwordSecretCode')],
    },
    {
        type: 'SQS',
        label: 'SQS',
        fields: [
            requiredText('region'),
            optionalText('accountId'),
            optionalText('queueUrl'),
            optionalText('endpoint'),
            optionalSecret('accessKeyIdSecretCode'),
            optionalSecret('secretAccessKeySecretCode'),
        ],
    },
    {
        type: 'REDIS',
        label: 'Redis',
        fields: [requiredText('host'), requiredPort()],
    },
    {
        type: 'CUSTOM',
        label: 'Custom',
        fields: [{ key: 'config', label: 'Configuration', type: 'json' }],
    },
];

const validConfigs: Record<string, Record<string, unknown>> = {
    HTTP: {},
    REST: {},
    GRAPHQL: {},
    POSTGRES: databaseConfig(),
    MYSQL: databaseConfig(),
    S3: { bucket: 'catalog', region: 'eu-central-1' },
    FTP: hostConfig(),
    SFTP: hostConfig(),
    RABBITMQ: { ...hostConfig(), passwordSecretCode: 'rabbitmq-password' },
    SQS: { region: 'eu-central-1', accountId: '123456789012' },
    REDIS: { host: 'redis.internal', port: 6379 },
    CUSTOM: { config: '{"endpoint":"https://example.com"}' },
};

describe('connection config draft validation', () => {
    it.each(Object.entries(validConfigs))(
        'accepts the minimum valid %s configuration',
        (type, config) => {
            expect(validateConnectionConfigDraft(
                type as keyof typeof CONNECTION_TYPE,
                config,
                schemas,
            )).toBeNull();
        },
    );

    it('rejects required fields, port ranges, and malformed custom JSON', () => {
        expect(validateConnectionConfigDraft(
            CONNECTION_TYPE.POSTGRES,
            { ...databaseConfig(), host: '' },
            schemas,
        )).toBe('REQUIRED_FIELD');
        expect(validateConnectionConfigDraft(
            CONNECTION_TYPE.POSTGRES,
            { ...databaseConfig(), port: 65_536 },
            schemas,
        )).toBe('INVALID_FIELD');
        expect(validateConnectionConfigDraft(
            CONNECTION_TYPE.CUSTOM,
            { config: '{' },
            schemas,
        )).toBe('INVALID_JSON');
    });

    it('validates HTTP authentication, URLs, and header policy', () => {
        expect(validateConnectionConfigDraft(CONNECTION_TYPE.HTTP, {
            baseUrl: 'https://user:password@example.com',
        }, schemas)).toBe('INVALID_URL');
        expect(validateConnectionConfigDraft(CONNECTION_TYPE.HTTP, {
            headers: { Host: 'example.com' },
        }, schemas)).toBe('INVALID_HEADERS');
        expect(validateConnectionConfigDraft(CONNECTION_TYPE.HTTP, {
            auth: { type: ConnectionAuthType.BEARER, secretCode: 'erp-token' },
        }, schemas)).toBe('INVALID_AUTHENTICATION');
        expect(validateConnectionConfigDraft(CONNECTION_TYPE.HTTP, {
            baseUrl: 'https://example.com',
            auth: {
                type: ConnectionAuthType.BASIC,
                secretCode: 'erp-password',
                usernameSecretCode: 'erp-username',
            },
        }, schemas)).toBeNull();
    });

    it('validates SQS URL sources and credential pairs', () => {
        expect(validateConnectionConfigDraft(CONNECTION_TYPE.SQS, {
            region: 'eu-central-1',
        }, schemas)).toBe('SQS_URL_REQUIRED');
        expect(validateConnectionConfigDraft(CONNECTION_TYPE.SQS, {
            region: 'eu-central-1',
            accountId: '123456789012',
            accessKeyIdSecretCode: 'aws-access-key',
        }, schemas)).toBe('SQS_CREDENTIAL_PAIR_REQUIRED');
    });
});

function requiredText(key: string) {
    return { key, label: key, type: 'text', required: true } as const;
}

function optionalText(key: string) {
    return { key, label: key, type: 'text' } as const;
}

function optionalSecret(key: string) {
    return { key, label: key, type: 'secret' } as const;
}

function requiredSecret(key: string) {
    return { key, label: key, type: 'secret', required: true } as const;
}

function requiredPort() {
    return {
        key: 'port',
        label: 'Port',
        type: 'number',
        required: true,
        min: 1,
        max: 65_535,
    } as const;
}

function requiredDatabaseFields() {
    return [
        requiredText('host'),
        requiredPort(),
        requiredText('database'),
        requiredText('username'),
    ];
}

function requiredHostFields() {
    return [requiredText('host'), requiredPort(), requiredText('username')];
}

function databaseConfig() {
    return {
        host: 'database.internal',
        port: 5432,
        database: 'catalog',
        username: 'importer',
    };
}

function hostConfig() {
    return { host: 'service.internal', port: 22, username: 'importer' };
}
