import { StepConfigSchema } from '../../types/index';
import { FILE_FORMAT_OPTIONS, FTP_PROTOCOL_OPTIONS } from '../../constants/adapter-schema-options';

/**
 * Inlined FTP protocol constants to avoid circular dependency.
 * Source: ./types.ts FTP_PROTOCOLS (types.ts imports from ../../constants/index barrel)
 */
const FTP = 'ftp' as const;
const SFTP = 'sftp' as const;

/**
 * Inlined FTP default values to avoid circular dependency.
 * Source: ./types.ts FTP_DEFAULTS
 */
const FTP_MAX_FILES = 50;
const FTP_TIMEOUT_MS = 30_000;

export const FTP_EXTRACTOR_SCHEMA: StepConfigSchema = {
    groups: [
        { id: 'connection', label: 'Connection', description: 'FTP/SFTP connection settings' },
        { id: 'auth', label: 'Authentication', description: 'Authentication settings' },
        { id: 'source', label: 'Source', description: 'Remote file settings' },
        { id: 'format', label: 'Format', description: 'File format options' },
        { id: 'postProcess', label: 'Post-Processing', description: 'Actions after processing' },
        { id: 'advanced', label: 'Advanced', description: 'Advanced options' },
    ],
    fields: [
        // Connection
        {
            key: 'connectionCode',
            label: 'Connection',
            description: 'Use a saved FTP/SFTP connection',
            type: 'connection',
            group: 'connection',
        },
        {
            key: 'protocol',
            label: 'Protocol',
            type: 'select',
            required: true,
            options: FTP_PROTOCOL_OPTIONS,
            defaultValue: SFTP,
            group: 'connection',
        },
        {
            key: 'host',
            label: 'Host',
            description: 'FTP/SFTP server hostname or IP',
            type: 'string',
            required: true,
            placeholder: 'ftp.example.com',
            group: 'connection',
        },
        {
            key: 'port',
            label: 'Port',
            description: 'Server port (FTP: 21, SFTP: 22)',
            type: 'number',
            group: 'connection',
        },
        {
            key: 'secure',
            label: 'Use FTPS',
            description: 'Enable secure FTP (TLS)',
            type: 'boolean',
            defaultValue: false,
            group: 'connection',
            dependsOn: { field: 'protocol', value: FTP },
        },
        {
            key: 'passiveMode',
            label: 'Passive Mode',
            description: 'Use passive mode for FTP',
            type: 'boolean',
            defaultValue: true,
            group: 'connection',
            dependsOn: { field: 'protocol', value: FTP },
        },
        // Authentication
        {
            key: 'username',
            label: 'Username',
            type: 'string',
            placeholder: 'ftpuser',
            group: 'auth',
        },
        {
            key: 'passwordSecretCode',
            label: 'Password',
            description: 'Secret code for password',
            type: 'secret',
            group: 'auth',
        },
        {
            key: 'privateKeySecretCode',
            label: 'Private Key',
            description: 'Secret code for SSH private key (SFTP)',
            type: 'secret',
            group: 'auth',
            dependsOn: { field: 'protocol', value: SFTP },
        },
        {
            key: 'passphraseSecretCode',
            label: 'Key Passphrase',
            description: 'Secret code for private key passphrase',
            type: 'secret',
            group: 'auth',
            dependsOn: { field: 'protocol', value: SFTP },
        },
        // Source
        {
            key: 'remotePath',
            label: 'Remote Path',
            description: 'Remote directory path',
            type: 'string',
            required: true,
            placeholder: '/data/exports',
            group: 'source',
        },
        {
            key: 'filePattern',
            label: 'File Pattern',
            description: 'File name pattern (e.g., *.csv, products-*.json)',
            type: 'string',
            placeholder: '*.csv',
            group: 'source',
        },
        {
            key: 'format',
            label: 'File Format',
            type: 'select',
            options: FILE_FORMAT_OPTIONS,
            group: 'format',
        },
        // Post-Processing
        {
            key: 'deleteAfterProcess',
            label: 'Delete After Processing',
            description: 'Delete files from server after successful processing',
            type: 'boolean',
            defaultValue: false,
            group: 'postProcess',
        },
        {
            key: 'moveAfterProcess.enabled',
            label: 'Move After Processing',
            description: 'Move files to another directory after processing',
            type: 'boolean',
            defaultValue: false,
            group: 'postProcess',
        },
        {
            key: 'moveAfterProcess.destinationPath',
            label: 'Destination Path',
            description: 'Path to move processed files',
            type: 'string',
            placeholder: '/data/processed',
            group: 'postProcess',
            dependsOn: { field: 'moveAfterProcess.enabled', value: true },
        },
        // Advanced
        {
            key: 'modifiedAfter',
            label: 'Modified After',
            description: 'Only process files modified after this date',
            type: 'string',
            placeholder: '2024-01-01T00:00:00Z',
            group: 'advanced',
        },
        {
            key: 'maxFiles',
            label: 'Max Files',
            description: 'Maximum number of files to process',
            type: 'number',
            defaultValue: FTP_MAX_FILES,
            group: 'advanced',
        },
        {
            key: 'includeFileMetadata',
            label: 'Include File Metadata',
            type: 'boolean',
            defaultValue: false,
            group: 'advanced',
        },
        {
            key: 'continueOnError',
            label: 'Continue on Error',
            type: 'boolean',
            defaultValue: true,
            group: 'advanced',
        },
        {
            key: 'timeoutMs',
            label: 'Timeout (ms)',
            description: 'Connection timeout in milliseconds',
            type: 'number',
            defaultValue: FTP_TIMEOUT_MS,
            group: 'advanced',
        },
    ],
};
