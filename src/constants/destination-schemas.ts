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
        type: 'FILE',
        label: 'File Configuration',
        configKey: 'fileConfig',
        fieldMapping: { directory: 'path', filename: 'filenamePattern' },
        fields: [
            {
                key: 'directory',
                label: 'Directory',
                type: 'text',
                defaultValue: '/exports',
                placeholder: '/exports',
                required: true,
            },
            {
                key: 'filename',
                label: 'Filename Pattern',
                type: 'text',
                defaultValue: 'export.csv',
                placeholder: 'export-{date}.csv',
                description: 'Available placeholders: {date}, {datetime}, {entity}, {timestamp}',
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
            { key: 'remotePath', label: 'Remote Path', type: 'text', placeholder: '/uploads/feeds' },
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
            { key: 'passwordSecretCode', label: 'Password Secret Code', type: 'secret', description: 'Reference a secret by code' },
            { key: 'secure', label: 'Use FTPS', type: 'boolean' },
            { key: 'remotePath', label: 'Remote Path', type: 'text', placeholder: '/uploads/exports' },
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
                key: 'authType',
                label: 'Authentication',
                type: 'select',
                defaultValue: ConnectionAuthType.NONE,
                options: AUTH_TYPE_HTTP_DESTINATION_OPTIONS,
            },
            { key: 'authSecretCode', label: 'Auth Secret Code', type: 'secret', description: 'Secret code for authentication' },
        ],
    },
    {
        type: 'S3',
        label: 'S3 Configuration',
        configKey: 's3Config',
        fields: [
            { key: 'bucket', label: 'Bucket', type: 'text', placeholder: 'my-bucket', required: true },
            { key: 'region', label: 'Region', type: 'text', placeholder: 'us-east-1', required: true },
            { key: 'accessKeyIdSecretCode', label: 'Access Key ID Secret', type: 'secret', description: 'Reference a secret by code' },
            { key: 'secretAccessKeySecretCode', label: 'Secret Access Key Secret', type: 'secret', description: 'Reference a secret by code' },
            { key: 'endpoint', label: 'Custom Endpoint', type: 'text', placeholder: 'https://s3.amazonaws.com' },
            { key: 'forcePathStyle', label: 'Force Path Style', type: 'boolean' },
            {
                key: 'key',
                label: 'Object Key (path)',
                type: 'text',
                placeholder: 'exports/products/{date}.csv',
                description: 'Available placeholders: {date}, {datetime}, {entity}, {timestamp}',
            },
        ],
    },
    {
        type: 'WEBHOOK',
        label: 'Webhook Configuration',
        configKey: 'webhookConfig',
        fields: [
            { key: 'url', label: 'Webhook URL', type: 'text', placeholder: 'https://hooks.example.com/export', required: true },
            { key: 'includeMetadata', label: 'Include export metadata in payload', type: 'boolean' },
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
                type: 'text',
                placeholder: 'user@example.com',
                required: true,
                description: 'Separate multiple addresses with commas.',
            },
            { key: 'subject', label: 'Subject', type: 'text', placeholder: 'Export: {entity} - {date}', required: true },
            { key: 'body', label: 'Body (optional)', type: 'text', placeholder: 'Please find the attached export file.' },
            { key: 'attachFile', label: 'Attach exported file', type: 'boolean', defaultValue: true },
        ],
    },
    {
        type: 'LOCAL',
        label: 'Local Directory Configuration',
        configKey: 'localConfig',
        fields: [
            {
                key: 'directory',
                label: 'Directory Path',
                type: 'text',
                placeholder: '/var/data/exports',
                required: true,
                description: 'Absolute path on the server where exported files will be written.',
            },
        ],
    },
    {
        type: 'DOWNLOAD',
        label: 'Download',
        configKey: '',
        message: 'The exported file will be available for download from the pipeline run results page after the export completes.',
        fields: [],
    },
];
