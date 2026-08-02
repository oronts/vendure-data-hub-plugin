/**
 * Connection schema definitions for each connection type.
 *
 * These schemas define the configuration form fields that the dashboard renders
 * for each connection type. They are served via the `dataHubConfigOptions` query
 * so the frontend can dynamically render connection configuration forms without
 * hardcoding field definitions.
 */
import { PORTS, DEFAULT_HOSTS } from '../../shared/constants';
import type { UIConnectionType } from '../../shared/constants';

export interface ConnectionSchemaField {
    key: string;
    label: string;
    /** Field input type used by dynamic dashboard forms. */
    type: 'text' | 'number' | 'password' | 'boolean' | 'secret' | 'select' | 'json';
    required?: boolean;
    placeholder?: string;
    defaultValue?: string | number | boolean;
    min?: number;
    max?: number;
    description?: string;
    options?: Array<{ value: string; label: string }>;
}

export interface ConnectionSchema {
    type: UIConnectionType;
    label: string;
    fields: ConnectionSchemaField[];
    /** True for HTTP-like connection types that use the dedicated HTTP editor with auth/headers support */
    httpLike?: boolean;
}

const DATABASE_TLS_CONNECTION_FIELDS = [
    {
        key: 'ssl',
        label: 'Use TLS',
        type: 'boolean',
        description: 'Encrypt the database connection',
    },
    {
        key: 'sslRejectUnauthorized',
        label: 'Verify TLS Certificate',
        type: 'boolean',
        defaultValue: true,
        description: 'Reject invalid or untrusted server certificates',
    },
    {
        key: 'sslCaSecretCode',
        label: 'TLS CA Secret Code',
        type: 'secret',
        description: 'Secret containing the trusted CA certificate',
    },
    {
        key: 'sslCertSecretCode',
        label: 'TLS Client Certificate Secret Code',
        type: 'secret',
        description: 'Secret containing the client certificate for mutual TLS',
    },
    {
        key: 'sslKeySecretCode',
        label: 'TLS Client Key Secret Code',
        type: 'secret',
        description: 'Secret containing the client private key for mutual TLS',
    },
] as const satisfies readonly ConnectionSchemaField[];

export const CONNECTION_SCHEMAS: ConnectionSchema[] = [
    {
        type: 'HTTP',
        label: 'HTTP / REST API',
        fields: [],
        httpLike: true,
    },
    {
        type: 'POSTGRES',
        label: 'PostgreSQL',
        fields: [
            { key: 'host', label: 'Host', type: 'text', placeholder: DEFAULT_HOSTS.LOCALHOST, required: true },
            { key: 'port', label: 'Port', type: 'number', placeholder: String(PORTS.POSTGRESQL), defaultValue: PORTS.POSTGRESQL, required: true, min: PORTS.MIN, max: PORTS.MAX },
            { key: 'database', label: 'Database', type: 'text', placeholder: 'mydb', required: true },
            { key: 'username', label: 'Username', type: 'text', placeholder: 'postgres', required: true },
            { key: 'passwordSecretCode', label: 'Password Secret Code', type: 'secret', description: 'Reference a secret by code' },
            ...DATABASE_TLS_CONNECTION_FIELDS,
        ],
    },
    {
        type: 'MYSQL',
        label: 'MySQL / MariaDB',
        fields: [
            { key: 'host', label: 'Host', type: 'text', placeholder: DEFAULT_HOSTS.LOCALHOST, required: true },
            { key: 'port', label: 'Port', type: 'number', placeholder: String(PORTS.MYSQL), defaultValue: PORTS.MYSQL, required: true, min: PORTS.MIN, max: PORTS.MAX },
            { key: 'database', label: 'Database', type: 'text', placeholder: 'mydb', required: true },
            { key: 'username', label: 'Username', type: 'text', placeholder: 'root', required: true },
            { key: 'passwordSecretCode', label: 'Password Secret Code', type: 'secret', description: 'Reference a secret by code' },
            ...DATABASE_TLS_CONNECTION_FIELDS,
        ],
    },
    {
        type: 'S3',
        label: 'Amazon S3 / Compatible',
        fields: [
            { key: 'bucket', label: 'Bucket', type: 'text', placeholder: 'my-bucket', required: true },
            { key: 'region', label: 'Region', type: 'text', placeholder: 'us-east-1', required: true },
            { key: 'accessKeyIdSecretCode', label: 'Access Key ID Secret', type: 'secret', description: 'Reference a secret by code' },
            { key: 'secretAccessKeySecretCode', label: 'Secret Access Key Secret', type: 'secret', description: 'Reference a secret by code' },
            { key: 'endpoint', label: 'Custom Endpoint', type: 'text', placeholder: 'https://s3.amazonaws.com' },
            { key: 'forcePathStyle', label: 'Force Path Style', type: 'boolean' },
        ],
    },
    {
        type: 'FTP',
        label: 'FTP',
        fields: [
            { key: 'host', label: 'Host', type: 'text', placeholder: 'ftp.example.com', required: true },
            { key: 'port', label: 'Port', type: 'number', placeholder: String(PORTS.FTP), defaultValue: PORTS.FTP, required: true, min: PORTS.MIN, max: PORTS.MAX },
            { key: 'username', label: 'Username', type: 'text', required: true },
            { key: 'passwordSecretCode', label: 'Password Secret Code', type: 'secret', description: 'Reference a secret by code' },
            { key: 'secure', label: 'Use FTPS', type: 'boolean' },
        ],
    },
    {
        type: 'SFTP',
        label: 'SFTP',
        fields: [
            { key: 'host', label: 'Host', type: 'text', placeholder: 'sftp.example.com', required: true },
            { key: 'port', label: 'Port', type: 'number', placeholder: String(PORTS.SFTP), defaultValue: PORTS.SFTP, required: true, min: PORTS.MIN, max: PORTS.MAX },
            { key: 'username', label: 'Username', type: 'text', required: true },
            { key: 'passwordSecretCode', label: 'Password Secret Code', type: 'secret', description: 'Or use privateKeySecretCode' },
            { key: 'privateKeySecretCode', label: 'Private Key Secret Code', type: 'secret', description: 'SSH private key' },
            { key: 'hostKeyFingerprintSecretCode', label: 'Host Key Fingerprint Secret Code', type: 'secret', description: 'Trusted OpenSSH SHA256 host-key fingerprint; required in production' },
        ],
    },
    {
        type: 'REST',
        label: 'REST API',
        fields: [],
        httpLike: true,
    },
    {
        type: 'GRAPHQL',
        label: 'GraphQL API',
        fields: [],
        httpLike: true,
    },
    {
        type: 'RABBITMQ',
        label: 'RabbitMQ',
        fields: [
            { key: 'host', label: 'Host', type: 'text', placeholder: DEFAULT_HOSTS.LOCALHOST, required: true },
            { key: 'port', label: 'Port', type: 'number', placeholder: String(PORTS.RABBITMQ), defaultValue: PORTS.RABBITMQ, required: true, min: PORTS.MIN, max: PORTS.MAX },
            { key: 'vhost', label: 'Virtual Host', type: 'text', placeholder: '/', description: 'RabbitMQ virtual host' },
            { key: 'username', label: 'Username', type: 'text', placeholder: 'guest', required: true },
            { key: 'passwordSecretCode', label: 'Password Secret Code', type: 'secret', description: 'Reference a secret by code', required: true },
            { key: 'ssl', label: 'SSL', type: 'boolean' },
        ],
    },
    {
        type: 'SQS',
        label: 'Amazon SQS',
        fields: [
            { key: 'region', label: 'Region', type: 'text', placeholder: 'us-east-1', required: true },
            { key: 'accountId', label: 'AWS Account ID', type: 'text', placeholder: '123456789012', description: 'Required to construct URLs for queues other than the direct Queue URL, including dead-letter queues' },
            { key: 'queueUrl', label: 'Queue URL (optional override)', type: 'text', placeholder: 'https://sqs.us-east-1.amazonaws.com/123456789/my-queue', description: 'Direct URL used only when its final path segment matches the requested queue name' },
            { key: 'endpoint', label: 'Custom Endpoint', type: 'text', placeholder: 'https://sqs.example.com', description: 'SQS-compatible base URL used with AWS Account ID to construct queue URLs' },
            { key: 'accessKeyIdSecretCode', label: 'Access Key ID Secret', type: 'secret', description: 'Reference a secret by code' },
            { key: 'secretAccessKeySecretCode', label: 'Secret Access Key Secret', type: 'secret', description: 'Reference a secret by code' },
        ],
    },
    {
        type: 'REDIS',
        label: 'Redis',
        fields: [
            { key: 'host', label: 'Host', type: 'text', placeholder: DEFAULT_HOSTS.LOCALHOST, required: true },
            { key: 'port', label: 'Port', type: 'number', placeholder: String(PORTS.REDIS), defaultValue: PORTS.REDIS, required: true, min: PORTS.MIN, max: PORTS.MAX },
            { key: 'passwordSecretCode', label: 'Password Secret Code', type: 'secret', description: 'Reference a secret by code' },
            { key: 'db', label: 'Database Number', type: 'number', placeholder: '0', defaultValue: 0, description: 'Redis database index (0-15)', min: 0, max: 15 },
            { key: 'ssl', label: 'SSL', type: 'boolean' },
        ],
    },
    {
        type: 'CUSTOM',
        label: 'Custom Connection',
        fields: [
            { key: 'config', label: 'Configuration (JSON)', type: 'json', description: 'Custom connection configuration as a JSON object. Structure depends on your specific integration.' },
        ],
    },
];
