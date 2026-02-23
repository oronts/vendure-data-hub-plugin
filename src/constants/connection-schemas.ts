/**
 * Connection schema definitions for each connection type.
 *
 * These schemas define the configuration form fields that the dashboard renders
 * for each connection type. They are served via the `dataHubConfigOptions` query
 * so the frontend can dynamically render connection configuration forms without
 * hardcoding field definitions.
 */
import { PORTS, DEFAULT_HOSTS } from '../../shared/constants';

export interface ConnectionSchemaField {
    key: string;
    label: string;
    /** Field input type: text, number, password, boolean, secret, select */
    type: 'text' | 'number' | 'password' | 'boolean' | 'secret' | 'select';
    required?: boolean;
    placeholder?: string;
    defaultValue?: string | number | boolean;
    description?: string;
    options?: Array<{ value: string; label: string }>;
}

export interface ConnectionSchema {
    type: string;
    label: string;
    fields: ConnectionSchemaField[];
    /** True for HTTP-like connection types that use the dedicated HTTP editor with auth/headers support */
    httpLike?: boolean;
}

export const CONNECTION_SCHEMAS: ConnectionSchema[] = [
    {
        type: 'HTTP',
        label: 'HTTP / REST API',
        fields: [],
        httpLike: true,
    },
    {
        type: 'DATABASE',
        label: 'Database (Generic)',
        fields: [
            { key: 'host', label: 'Host', type: 'text', placeholder: DEFAULT_HOSTS.LOCALHOST, required: true },
            { key: 'port', label: 'Port', type: 'number', placeholder: String(PORTS.POSTGRESQL), required: true },
            { key: 'database', label: 'Database', type: 'text', placeholder: 'mydb', required: true },
            { key: 'username', label: 'Username', type: 'text', placeholder: 'postgres', required: true },
            { key: 'passwordSecretCode', label: 'Password Secret Code', type: 'secret', description: 'Reference a secret by code' },
            { key: 'ssl', label: 'SSL', type: 'boolean' },
        ],
    },
    {
        type: 'POSTGRES',
        label: 'PostgreSQL',
        fields: [
            { key: 'host', label: 'Host', type: 'text', placeholder: DEFAULT_HOSTS.LOCALHOST, required: true },
            { key: 'port', label: 'Port', type: 'number', placeholder: String(PORTS.POSTGRESQL), required: true },
            { key: 'database', label: 'Database', type: 'text', placeholder: 'mydb', required: true },
            { key: 'username', label: 'Username', type: 'text', placeholder: 'postgres', required: true },
            { key: 'passwordSecretCode', label: 'Password Secret Code', type: 'secret', description: 'Reference a secret by code' },
            { key: 'ssl', label: 'SSL', type: 'boolean' },
        ],
    },
    {
        type: 'MYSQL',
        label: 'MySQL / MariaDB',
        fields: [
            { key: 'host', label: 'Host', type: 'text', placeholder: DEFAULT_HOSTS.LOCALHOST, required: true },
            { key: 'port', label: 'Port', type: 'number', placeholder: String(PORTS.MYSQL), required: true },
            { key: 'database', label: 'Database', type: 'text', placeholder: 'mydb', required: true },
            { key: 'username', label: 'Username', type: 'text', placeholder: 'root', required: true },
            { key: 'passwordSecretCode', label: 'Password Secret Code', type: 'secret', description: 'Reference a secret by code' },
        ],
    },
    {
        type: 'MSSQL',
        label: 'Microsoft SQL Server',
        fields: [
            { key: 'host', label: 'Host', type: 'text', placeholder: DEFAULT_HOSTS.LOCALHOST, required: true },
            { key: 'port', label: 'Port', type: 'number', placeholder: String(PORTS.MSSQL), required: true },
            { key: 'database', label: 'Database', type: 'text', placeholder: 'mydb', required: true },
            { key: 'username', label: 'Username', type: 'text', placeholder: 'sa', required: true },
            { key: 'passwordSecretCode', label: 'Password Secret Code', type: 'secret', description: 'Reference a secret by code' },
            { key: 'encrypt', label: 'Encrypt', type: 'boolean', description: 'Use encrypted connection' },
            { key: 'trustServerCertificate', label: 'Trust Server Certificate', type: 'boolean', description: 'Trust the server certificate without validation' },
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
            { key: 'port', label: 'Port', type: 'number', placeholder: String(PORTS.FTP), required: true },
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
            { key: 'port', label: 'Port', type: 'number', placeholder: String(PORTS.SFTP), required: true },
            { key: 'username', label: 'Username', type: 'text', required: true },
            { key: 'passwordSecretCode', label: 'Password Secret Code', type: 'secret', description: 'Or use privateKeySecretCode' },
            { key: 'privateKeySecretCode', label: 'Private Key Secret Code', type: 'secret', description: 'SSH private key' },
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
            { key: 'port', label: 'Port', type: 'number', placeholder: '5672', required: true },
            { key: 'vhost', label: 'Virtual Host', type: 'text', placeholder: '/', description: 'RabbitMQ virtual host' },
            { key: 'username', label: 'Username', type: 'text', placeholder: 'guest', required: true },
            { key: 'passwordSecretCode', label: 'Password Secret Code', type: 'secret', description: 'Reference a secret by code' },
            { key: 'ssl', label: 'SSL', type: 'boolean' },
        ],
    },
    {
        type: 'SQS',
        label: 'Amazon SQS',
        fields: [
            { key: 'region', label: 'Region', type: 'text', placeholder: 'us-east-1', required: true },
            { key: 'queueUrl', label: 'Queue URL', type: 'text', placeholder: 'https://sqs.us-east-1.amazonaws.com/123456789/my-queue', required: true },
            { key: 'accessKeyIdSecretCode', label: 'Access Key ID Secret', type: 'secret', description: 'Reference a secret by code' },
            { key: 'secretAccessKeySecretCode', label: 'Secret Access Key Secret', type: 'secret', description: 'Reference a secret by code' },
        ],
    },
    {
        type: 'REDIS',
        label: 'Redis',
        fields: [
            { key: 'host', label: 'Host', type: 'text', placeholder: DEFAULT_HOSTS.LOCALHOST, required: true },
            { key: 'port', label: 'Port', type: 'number', placeholder: '6379', required: true },
            { key: 'passwordSecretCode', label: 'Password Secret Code', type: 'secret', description: 'Reference a secret by code' },
            { key: 'db', label: 'Database Number', type: 'number', placeholder: '0', description: 'Redis database index (0-15)' },
            { key: 'ssl', label: 'SSL', type: 'boolean' },
        ],
    },
    {
        type: 'MONGODB',
        label: 'MongoDB',
        fields: [
            { key: 'host', label: 'Host', type: 'text', placeholder: DEFAULT_HOSTS.LOCALHOST, defaultValue: 'localhost' },
            { key: 'port', label: 'Port', type: 'number', placeholder: '27017', defaultValue: 27017 },
            { key: 'database', label: 'Database', type: 'text', placeholder: 'mydb', required: true },
            { key: 'username', label: 'Username', type: 'text' },
            { key: 'passwordSecretCode', label: 'Password Secret Code', type: 'secret', description: 'Reference a secret by code' },
            { key: 'authSource', label: 'Auth Source', type: 'text', placeholder: 'admin', defaultValue: 'admin', description: 'Authentication database name' },
            { key: 'ssl', label: 'SSL', type: 'boolean', defaultValue: false },
            { key: 'replicaSet', label: 'Replica Set', type: 'text', description: 'Replica set name (optional)' },
        ],
    },
    {
        type: 'CUSTOM',
        label: 'Custom Connection',
        fields: [
            { key: 'config', label: 'Configuration (JSON)', type: 'text', description: 'Custom connection configuration as a JSON object. Structure depends on your specific integration.' },
        ],
    },
];
