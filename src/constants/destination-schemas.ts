/**
 * Destination schema definitions for each export destination type.
 *
 * These schemas define the configuration form fields that the dashboard renders
 * for each destination type. They are served via the `dataHubConfigOptions` query
 * so the frontend can dynamically render destination configuration forms without
 * hardcoding field definitions per destination type.
 *
 * The `configKey` tells the frontend which sub-object in the wizard state to
 * read/write (e.g. 'sftpConfig', 's3Config'). The `message` field provides
 * informational text for destination types that have no configurable fields.
 */
import { ConnectionSchemaField } from './connection-schemas';
import { PORTS } from '../../shared/constants';
import { HttpMethod } from './enums';
import { HTTP_METHOD_EXPORT_OPTIONS, AUTH_TYPE_HTTP_DESTINATION_OPTIONS } from './adapter-schema-options';
import { ConnectionAuthType } from '../../shared/types/adapter-config.types';

export interface DestinationSchema {
    /** Destination type key (e.g. 'SFTP', 'S3', 'HTTP') */
    type: string;
    /** Human-readable label */
    label: string;
    /** Key in the wizard destination state object (e.g. 'sftpConfig') */
    configKey: string;
    /** Informational message shown when there are no configurable fields */
    message?: string;
    /** Field definitions for the destination configuration form */
    fields: ConnectionSchemaField[];
    /**
     * Maps wizard field names to pipeline config field names.
     * When set, the wizard-to-pipeline converter renames fields accordingly
     * instead of copying them verbatim. Example: `{ directory: 'path' }`.
     */
    fieldMapping?: Record<string, string>;
}

export const DESTINATION_SCHEMAS: DestinationSchema[] = [
    {
        type: 'LOCAL',
        label: 'Local Directory Configuration',
        configKey: 'localConfig',
        fields: [
            {
                key: 'directory',
                label: 'Directory',
                type: 'text',
                defaultValue: '.',
                placeholder: 'partners/acme',
                required: true,
                description: 'Relative directory under the configured Data Hub export root.',
            },
        ],
    },
    {
        type: 'SFTP',
        label: 'SFTP Configuration',
        configKey: 'sftpConfig',
        fields: [
            { key: 'host', label: 'Host', type: 'text', placeholder: 'sftp.example.com', required: true },
            { key: 'port', label: 'Port', type: 'number', placeholder: String(PORTS.SFTP), required: true },
            { key: 'username', label: 'Username', type: 'text', required: true },
            { key: 'passwordSecretCode', label: 'Password Secret Code', type: 'secret', description: 'Or use privateKeySecretCode' },
            { key: 'privateKeySecretCode', label: 'Private Key Secret Code', type: 'secret', description: 'SSH private key' },
            { key: 'passphraseSecretCode', label: 'Private Key Passphrase Secret Code', type: 'secret' },
            { key: 'hostKeyFingerprintSecretCode', label: 'Host Key Fingerprint Secret Code', type: 'secret', description: 'Trusted OpenSSH SHA256 host-key fingerprint; required in production' },
            { key: 'remotePath', label: 'Remote Path', type: 'text', placeholder: '/uploads/feeds', required: true },
            { key: 'timeout', label: 'Timeout (ms)', type: 'number', placeholder: '30000' },
        ],
    },
    {
        type: 'FTP',
        label: 'FTP Configuration',
        configKey: 'ftpConfig',
        fields: [
            { key: 'host', label: 'Host', type: 'text', placeholder: 'ftp.example.com', required: true },
            { key: 'port', label: 'Port', type: 'number', placeholder: String(PORTS.FTP), required: true },
            { key: 'username', label: 'Username', type: 'text', required: true },
            { key: 'passwordSecretCode', label: 'Password Secret Code', type: 'secret', required: true, description: 'Reference a secret by code' },
            { key: 'secure', label: 'Use FTPS', type: 'boolean' },
            { key: 'remotePath', label: 'Remote Path', type: 'text', placeholder: '/uploads/exports', required: true },
        ],
    },
    {
        type: 'HTTP',
        label: 'HTTP Configuration',
        configKey: 'httpConfig',
        fields: [
            {
                key: 'method',
                label: 'Method',
                type: 'select',
                defaultValue: HttpMethod.POST,
                options: HTTP_METHOD_EXPORT_OPTIONS,
            },
            { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/import', required: true },
            {
                key: 'auth.type',
                label: 'Authentication',
                type: 'select',
                defaultValue: ConnectionAuthType.NONE,
                options: AUTH_TYPE_HTTP_DESTINATION_OPTIONS,
            },
            { key: 'auth.secretCode', label: 'Auth Secret Code', type: 'secret', description: 'Credential Secret Code for Basic, Bearer, or API key authentication.' },
            { key: 'auth.username', label: 'Basic Username', type: 'text', description: 'Non-secret Basic authentication username.' },
            { key: 'auth.usernameSecretCode', label: 'Basic Username Secret Code', type: 'secret' },
            { key: 'auth.headerName', label: 'API Key Header', type: 'text', placeholder: 'X-API-Key' },
            { key: 'headers', label: 'Static Headers', type: 'json', description: 'Non-sensitive headers only. Authentication, cookies, API keys, tokens, and secrets are rejected.' },
            { key: 'headerSecretCodes', label: 'Secret-backed Headers', type: 'json', description: 'JSON object mapping header names to Data Hub Secret Codes.' },
        ],
    },
    {
        type: 'S3',
        label: 'S3 Configuration',
        configKey: 's3Config',
        fields: [
            { key: 'bucket', label: 'Bucket', type: 'text', placeholder: 'my-bucket', required: true },
            { key: 'region', label: 'Region', type: 'text', placeholder: 'us-east-1', required: true },
            { key: 'accessKeyIdSecretCode', label: 'Access Key ID Secret', type: 'secret', required: true, description: 'Reference a secret by code' },
            { key: 'secretAccessKeySecretCode', label: 'Secret Access Key Secret', type: 'secret', required: true, description: 'Reference a secret by code' },
            { key: 'endpoint', label: 'Custom Endpoint', type: 'text', placeholder: 'https://s3.amazonaws.com' },
            { key: 'prefix', label: 'Object Key Prefix', type: 'text', placeholder: 'exports/products' },
            {
                key: 'acl',
                label: 'Object ACL',
                type: 'select',
                options: [
                    { value: 'private', label: 'Private' },
                    { value: 'public-read', label: 'Public read' },
                ],
            },
        ],
    },
    {
        type: 'EMAIL',
        label: 'Email Configuration',
        configKey: 'emailConfig',
        fields: [
            {
                key: 'to',
                label: 'Recipient(s)',
                type: 'json',
                placeholder: '["user@example.com"]',
                required: true,
                description: 'JSON array of recipient email addresses.',
            },
            { key: 'cc', label: 'CC Recipients', type: 'json', placeholder: '[]' },
            { key: 'bcc', label: 'BCC Recipients', type: 'json', placeholder: '[]' },
            { key: 'from', label: 'From', type: 'text', placeholder: 'exports@example.com' },
            { key: 'subject', label: 'Subject', type: 'text', placeholder: 'Export: {entity} - {date}', required: true },
            { key: 'body', label: 'Body (optional)', type: 'text', placeholder: 'Please find the attached export file.' },
            { key: 'smtp.host', label: 'SMTP Host', type: 'text', required: true },
            { key: 'smtp.port', label: 'SMTP Port', type: 'number', defaultValue: PORTS.SMTP, required: true },
            { key: 'smtp.secure', label: 'SMTP TLS', type: 'boolean' },
            { key: 'smtp.username', label: 'SMTP Username', type: 'text' },
            { key: 'smtp.usernameSecretCode', label: 'SMTP Username Secret Code', type: 'secret' },
            { key: 'smtp.passwordSecretCode', label: 'SMTP Password Secret Code', type: 'secret' },
        ],
    },
];
