import { AckMode, TriggerType } from './enums';
import type { OptionValue, TypedOptionValue } from './enum-metadata';
import { GATE_LIMITS } from './defaults/core-defaults';
import { QUEUE } from './defaults/runtime-defaults';
import { FILE_WATCH } from './defaults/storage-defaults';
import { DEFAULT_WEBHOOK_CONFIG } from './trigger-adapters';

// ---------------------------------------------------------------------------
// Config option arrays (served via GraphQL dataHubConfigOptions query)
// ---------------------------------------------------------------------------

/** Compression type options for export/feed destinations */
export const COMPRESSION_TYPES: OptionValue[] = [
    { value: 'NONE', label: 'None' },
    { value: 'GZIP', label: 'GZIP' },
    { value: 'ZIP', label: 'ZIP' },
];

/** New-record strategy options for import wizard (CREATE/SKIP/ERROR are wizard-internal values, not in LoadStrategy enum) */
export const NEW_RECORD_STRATEGIES: OptionValue[] = [
    { value: 'CREATE', label: 'Create new records', description: 'Create new records when no existing match is found' },
    { value: 'SKIP', label: 'Skip new records', description: 'Skip records that don\'t match existing entries' },
    { value: 'ERROR', label: 'Error on new record', description: 'Raise an error when encountering unmatched records' },
];

/** Cleanup strategy options for post-import record management */
export const CLEANUP_STRATEGIES: OptionValue[] = [
    { value: 'NONE', label: 'No Cleanup', description: 'Do not remove any records' },
    { value: 'UNPUBLISH_MISSING', label: 'Unpublish Missing', description: 'Unpublish records not in source' },
    { value: 'DELETE_MISSING', label: 'Delete Missing', description: 'Delete records not in source' },
];

/** Destination type options for export/feed delivery */
export const DESTINATION_TYPES: OptionValue[] = [
    { value: 'LOCAL', label: 'Local Directory', icon: 'hard-drive' },
    { value: 'SFTP', label: 'SFTP Server', icon: 'server' },
    { value: 'FTP', label: 'FTP Server', icon: 'upload' },
    { value: 'HTTP', label: 'HTTP Endpoint', icon: 'send' },
    { value: 'S3', label: 'AWS S3', icon: 'cloud' },
    { value: 'EMAIL', label: 'Email', icon: 'mail' },
];

/** Common gate config fields shown for all approval types */
const GATE_COMMON_FIELDS: TypedOptionValue['fields'] = [
    { key: 'notifyWebhook', label: 'Notify Webhook', type: 'string', placeholder: 'https://hooks.example.com/gate-notify', description: 'Webhook URL to call when the gate is reached (optional)' },
    { key: 'notifyEmail', label: 'Notify Email', type: 'string', placeholder: 'approver@example.com', description: 'Email address to notify when the gate is reached (optional)' },
    { key: 'previewCount', label: 'Preview Count', type: 'number', placeholder: String(GATE_LIMITS.DEFAULT_PREVIEW_COUNT), min: 1, max: GATE_LIMITS.MAX_PREVIEW_COUNT, description: `Number of records to include in the gate preview (default: ${GATE_LIMITS.DEFAULT_PREVIEW_COUNT})` },
];

/** Approval type options for gate steps (with per-type field schemas) */
export const APPROVAL_TYPES: TypedOptionValue[] = [
    {
        value: 'MANUAL',
        label: 'Manual',
        description: 'Requires explicit human approval to proceed',
        fields: [...GATE_COMMON_FIELDS],
    },
    {
        value: 'THRESHOLD',
        label: 'Threshold',
        description: 'Auto-approve if error rate is below threshold',
        fields: [
            { key: 'errorThresholdPercent', label: 'Error Threshold (%)', type: 'number', required: true, placeholder: '10', min: 0, max: 100, description: 'Auto-approve if error rate is below this percentage (0-100)' },
            ...GATE_COMMON_FIELDS,
        ],
    },
    {
        value: 'TIMEOUT',
        label: 'Timeout',
        description: 'Auto-approve after a timeout period',
        fields: [
            { key: 'timeoutSeconds', label: 'Timeout (seconds)', type: 'number', required: true, placeholder: '300', min: GATE_LIMITS.MIN_TIMEOUT_SECONDS, max: GATE_LIMITS.MAX_TIMEOUT_SECONDS, description: 'Number of seconds to wait before auto-approving' },
            ...GATE_COMMON_FIELDS,
        ],
    },
];

/** Backoff strategy options for retry configuration */
export const BACKOFF_STRATEGIES: OptionValue[] = [
    { value: 'FIXED', label: 'Fixed', description: 'Wait a fixed duration between retries' },
    { value: 'EXPONENTIAL', label: 'Exponential', description: 'Double the wait time after each retry' },
];

/** Trigger type options with field schemas and wizard scope metadata */
export const TRIGGER_TYPE_SCHEMAS: TypedOptionValue[] = [
    {
        value: TriggerType.MANUAL,
        label: 'Manual',
        description: 'Run manually from the dashboard',
        icon: 'play',
        fields: [],
        wizardScopes: ['import', 'export'],
    },
    {
        value: TriggerType.SCHEDULE,
        label: 'Schedule',
        description: 'Run on a cron expression or fixed interval',
        icon: 'clock',
        fields: [
            { key: 'schedule', label: 'Cron Expression', type: 'string', placeholder: '* * * * *', description: 'Configure this or Interval Seconds, but not both. Format: minute hour day month weekday.', optionsRef: 'cronPresets' },
            { key: 'intervalSec', label: 'Interval Seconds', type: 'number', placeholder: '300', description: 'Positive whole seconds. Leave Cron Expression empty when using an interval.' },
            { key: 'timezone', label: 'Timezone', type: 'string', placeholder: 'UTC (default)', description: 'IANA timezone used by cron schedules.' },
        ],
        configKeyMap: { schedule: 'cron' },
        wizardScopes: ['import', 'export'],
    },
    {
        value: TriggerType.WEBHOOK,
        label: 'Webhook',
        description: 'Trigger via HTTP webhook',
        icon: 'webhook',
        fields: [
            {
                key: 'authentication',
                label: 'Authentication',
                type: 'select',
                required: true,
                options: [
                    { value: 'HMAC', label: 'HMAC signature' },
                    { value: 'API_KEY', label: 'API key' },
                    { value: 'BASIC', label: 'Basic authentication' },
                    { value: 'JWT', label: 'JWT (HS256)' },
                    { value: 'NONE', label: 'None (unsafe)' },
                ],
                defaultValue: DEFAULT_WEBHOOK_CONFIG.authentication,
                description: 'The endpoint is /data-hub/webhook/{pipeline-code}.',
            },
            { key: 'secretCode', label: 'HMAC Secret', type: 'secret', placeholder: 'Required for HMAC' },
            { key: 'hmacHeaderName', label: 'HMAC Header', type: 'string', defaultValue: DEFAULT_WEBHOOK_CONFIG.hmacHeaderName },
            {
                key: 'hmacAlgorithm',
                label: 'HMAC Algorithm',
                type: 'select',
                options: [
                    { value: 'SHA256', label: 'SHA-256' },
                    { value: 'SHA512', label: 'SHA-512' },
                ],
                defaultValue: DEFAULT_WEBHOOK_CONFIG.hmacAlgorithm,
            },
            { key: 'apiKeySecretCode', label: 'API Key Secret', type: 'secret', placeholder: 'Required for API key auth' },
            { key: 'apiKeyHeaderName', label: 'API Key Header', type: 'string', defaultValue: DEFAULT_WEBHOOK_CONFIG.apiKeyHeaderName },
            { key: 'apiKeyPrefix', label: 'API Key Prefix', type: 'string', placeholder: 'Optional, e.g. Bearer ' },
            { key: 'basicSecretCode', label: 'Basic Credentials Secret', type: 'secret', placeholder: 'Required; store username:password' },
            { key: 'jwtSecretCode', label: 'JWT Secret', type: 'secret', placeholder: 'Required for JWT auth' },
            { key: 'jwtHeaderName', label: 'JWT Header', type: 'string', defaultValue: DEFAULT_WEBHOOK_CONFIG.jwtHeaderName },
            { key: 'jwtIssuer', label: 'JWT Issuer', type: 'string', placeholder: 'Required issuer claim (optional)' },
            { key: 'jwtAudience', label: 'JWT Audience', type: 'string', placeholder: 'Required audience claim (optional)' },
            { key: 'rateLimit', label: 'Requests Per Window', type: 'number', defaultValue: DEFAULT_WEBHOOK_CONFIG.rateLimit },
            { key: 'rateLimitWindow', label: 'Rate Limit Window (seconds)', type: 'number', defaultValue: DEFAULT_WEBHOOK_CONFIG.rateLimitWindow },
            { key: 'requireIdempotencyKey', label: 'Require Idempotency Key', type: 'boolean', defaultValue: DEFAULT_WEBHOOK_CONFIG.requireIdempotencyKey },
            { key: 'idempotencyKeyHeader', label: 'Idempotency Header', type: 'string', defaultValue: DEFAULT_WEBHOOK_CONFIG.idempotencyKeyHeader },
            { key: 'idempotencyTtlSec', label: 'Idempotency TTL (seconds)', type: 'number', defaultValue: DEFAULT_WEBHOOK_CONFIG.idempotencyTtlSec },
        ],
        wizardScopes: ['import', 'export'],
    },
    {
        value: TriggerType.EVENT,
        label: 'Event',
        description: 'Trigger on Vendure events',
        icon: 'zap',
        fields: [
            { key: 'event', label: 'Event Type', type: 'select', required: true, optionsRef: 'vendureEvents', placeholder: 'Select event...' },
        ],
        wizardScopes: ['export'],
    },
    {
        value: TriggerType.FILE,
        label: 'File Watch',
        description: 'Watch for new files',
        icon: 'folder-open',
        fields: [
            { key: 'connectionCode', label: 'Connection Code', type: 'connection', required: true, placeholder: 'my-sftp-connection' },
            { key: 'path', label: 'Watch Path', type: 'string', required: true, placeholder: '/incoming', description: 'Remote directory for FTP/SFTP or object prefix for S3' },
            { key: 'pattern', label: 'File Pattern', type: 'string', placeholder: '*.csv', description: 'Optional glob matched against each discovered file name' },
            { key: 'recursive', label: 'Include Subdirectories', type: 'boolean', defaultValue: true },
            { key: 'minFileAge', label: 'Minimum File Age (seconds)', type: 'number', defaultValue: FILE_WATCH.DEFAULT_MIN_FILE_AGE_SEC, min: FILE_WATCH.MIN_FILE_AGE_SEC, max: FILE_WATCH.MAX_FILE_AGE_SEC, description: 'Wait before processing a newly modified file' },
            { key: 'pollIntervalMs', label: 'Poll Interval (ms)', type: 'number', defaultValue: FILE_WATCH.DEFAULT_POLL_INTERVAL_MS, min: FILE_WATCH.MIN_POLL_INTERVAL_MS, max: FILE_WATCH.MAX_POLL_INTERVAL_MS, description: 'Delay between remote source polls' },
        ],
        configKeyMap: {
            connectionCode: 'fileWatch.connectionCode',
            path: 'fileWatch.path',
            pattern: 'fileWatch.pattern',
            recursive: 'fileWatch.recursive',
            minFileAge: 'fileWatch.minFileAge',
            pollIntervalMs: 'fileWatch.pollIntervalMs',
        },
        wizardScopes: ['import'],
    },
    {
        value: TriggerType.MESSAGE,
        label: 'Message Queue',
        description: 'Trigger from message queue',
        icon: 'message-square',
        fields: [
            { key: 'queueType', label: 'Queue Type', type: 'select', required: true, optionsRef: 'queueTypes' },
            { key: 'connectionCode', label: 'Connection Code', type: 'connection', placeholder: 'my-queue-connection', description: 'Required for every queue type except INTERNAL' },
            { key: 'queueName', label: 'Queue Name', type: 'string', required: true, placeholder: 'my-queue' },
            { key: 'batchSize', label: 'Batch Size', type: 'number', defaultValue: QUEUE.DEFAULT_MESSAGE_BATCH_SIZE, min: QUEUE.MIN_MESSAGE_BATCH_SIZE, max: QUEUE.MAX_MESSAGE_BATCH_SIZE, description: `Messages per poll (${QUEUE.MIN_MESSAGE_BATCH_SIZE}-${QUEUE.MAX_MESSAGE_BATCH_SIZE})` },
            { key: 'concurrency', label: 'Concurrency', type: 'number', defaultValue: QUEUE.DEFAULT_MESSAGE_CONCURRENCY, min: QUEUE.MIN_MESSAGE_CONCURRENCY, max: QUEUE.MAX_MESSAGE_CONCURRENCY, description: `Parallel message deliveries (${QUEUE.MIN_MESSAGE_CONCURRENCY}-${QUEUE.MAX_MESSAGE_CONCURRENCY})` },
            { key: 'prefetch', label: 'Prefetch', type: 'number', min: QUEUE.MIN_MESSAGE_PREFETCH, max: QUEUE.MAX_MESSAGE_PREFETCH, description: `Optional broker prefetch window (${QUEUE.MIN_MESSAGE_PREFETCH}-${QUEUE.MAX_MESSAGE_PREFETCH})` },
            { key: 'pollIntervalMs', label: 'Poll Interval (ms)', type: 'number', defaultValue: QUEUE.DEFAULT_MESSAGE_POLL_INTERVAL_MS, min: QUEUE.DEFAULT_MESSAGE_POLL_INTERVAL_MS, max: QUEUE.MAX_MESSAGE_POLL_INTERVAL_MS, description: `Delay between broker polls (${QUEUE.DEFAULT_MESSAGE_POLL_INTERVAL_MS}-${QUEUE.MAX_MESSAGE_POLL_INTERVAL_MS} ms)` },
            { key: 'ackMode', label: 'Ack Mode', type: 'select', optionsRef: 'ackModes', defaultValue: 'MANUAL' },
            { key: 'maxRetries', label: 'Max Retries', type: 'number', defaultValue: QUEUE.DEFAULT_MESSAGE_RETRIES, description: `Immediate enqueue retries after the first failure (0-${QUEUE.MAX_MESSAGE_RETRIES})` },
            { key: 'consumerGroup', label: 'Consumer Group (Optional)', type: 'string', placeholder: 'datahub-consumers', description: 'Redis Streams consumer group; unsupported for other queue types' },
            { key: 'deadLetterQueue', label: 'Dead Letter Queue (Optional)', type: 'string', placeholder: 'my-queue-dlq', description: 'Failed messages are routed here' },
            { key: 'autoStart', label: 'Auto-start consumer on startup', type: 'boolean', defaultValue: true },
        ],
        configKeyMap: {
            queueType: 'message.queueType',
            connectionCode: 'message.connectionCode',
            queueName: 'message.queueName',
            batchSize: 'message.batchSize',
            concurrency: 'message.concurrency',
            prefetch: 'message.prefetch',
            pollIntervalMs: 'message.pollIntervalMs',
            ackMode: 'message.ackMode',
            maxRetries: 'message.maxRetries',
            consumerGroup: 'message.consumerGroup',
            deadLetterQueue: 'message.deadLetterQueue',
            autoStart: 'message.autoStart',
        },
        wizardScopes: [],
    },
];

/** Enrichment source type options with field schemas for enrich steps */
export const ENRICHMENT_SOURCE_TYPES: TypedOptionValue[] = [
    {
        value: 'STATIC',
        label: 'Static',
        description: 'Use a static lookup map defined in the step config',
        fields: [
            { key: 'defaults', label: 'Default Values', type: 'keyValuePairs' },
        ],
    },
    {
        value: 'HTTP',
        label: 'HTTP',
        description: 'Fetch enrichment data from an HTTP endpoint',
        fields: [
            { key: 'url', label: 'URL', type: 'string', required: true, placeholder: 'https://api.example.com/lookup/{{id}}', description: 'URL to fetch enrichment data. Use {{field.path}} for dynamic values.' },
            { key: 'keyField', label: 'Key Field', type: 'string', placeholder: 'sku', description: 'Record field to use as the lookup cache key' },
            { key: 'target', label: 'Target Field', type: 'string', placeholder: 'enrichment', description: 'Field name to store the enrichment result on each record' },
            { key: 'responsePath', label: 'Response Path', type: 'string', placeholder: 'data', description: 'JSON path to extract from the HTTP response (e.g. data.items)' },
            { key: 'method', label: 'HTTP Method', type: 'string', placeholder: 'GET', description: 'HTTP method (GET or POST)' },
            { key: 'bearerTokenSecretCode', label: 'Bearer Token Secret', type: 'secret', placeholder: 'my-api-token', description: 'Secret code for Bearer token authentication' },
            { key: 'cacheTtlSec', label: 'Cache TTL (sec)', type: 'number', placeholder: '3600', description: 'Cache duration in seconds for HTTP responses' },
            { key: 'skipOn404', label: 'Skip on 404', type: 'boolean', description: 'Skip enrichment instead of failing when endpoint returns 404' },
        ],
    },
    {
        value: 'VENDURE',
        label: 'Vendure',
        description: 'Query Vendure entities for enrichment data',
        fields: [
            { key: 'entityType', label: 'Entity Type', type: 'entitySelect', required: true },
            { key: 'sourceField', label: 'Source Field', type: 'string', required: true, placeholder: 'sku', description: 'Record field to use for entity lookup' },
            { key: 'lookupField', label: 'Lookup Field', type: 'string', required: true, placeholder: 'sku', description: 'Vendure entity field to match against' },
            { key: 'target', label: 'Target Field', type: 'string', placeholder: 'vendureData', description: 'Field name to store the matched entity data' },
        ],
    },
];

/** Wizard strategy mappings: map wizard existingRecords option to backend load/conflict strategies */
export const WIZARD_STRATEGY_MAPPINGS: Array<{
    wizardValue: string;
    label: string;
    loadStrategy: string;
    conflictStrategy: string;
}> = [
    { wizardValue: 'SKIP', label: 'Skip existing', loadStrategy: 'CREATE', conflictStrategy: 'SOURCE_WINS' },
    { wizardValue: 'UPDATE', label: 'Update existing', loadStrategy: 'UPSERT', conflictStrategy: 'MERGE' },
    { wizardValue: 'REPLACE', label: 'Replace existing', loadStrategy: 'UPSERT', conflictStrategy: 'SOURCE_WINS' },
    { wizardValue: 'ERROR', label: 'Error on existing', loadStrategy: 'CREATE', conflictStrategy: 'SOURCE_WINS' },
];

/** Export query type options for the export wizard source step */
export const QUERY_TYPE_OPTIONS: OptionValue[] = [
    { value: 'all', label: 'All Records', description: 'Export all records of the selected entity' },
    { value: 'query', label: 'With Filters', description: 'Apply filter conditions to select records' },
];

/** Validation rule type options with field schemas for validate steps */
export const VALIDATION_RULE_TYPES: TypedOptionValue[] = [
    {
        value: 'REQUIRED',
        label: 'Required',
        description: 'Field must be present and non-empty',
        fields: [],
        defaultValues: { required: true },
    },
    {
        value: 'RANGE',
        label: 'Range',
        description: 'Numeric value must be within min/max bounds',
        fields: [
            { key: 'min', label: 'Min', type: 'number' },
            { key: 'max', label: 'Max', type: 'number' },
        ],
        defaultValues: { min: 0 },
    },
    {
        value: 'PATTERN',
        label: 'Pattern',
        description: 'Value must match a regular expression pattern',
        fields: [
            { key: 'pattern', label: 'Pattern', type: 'string', required: true, placeholder: '^[A-Z0-9]+$' },
        ],
        defaultValues: { pattern: '' },
    },
];
/** Cron schedule presets for schedule trigger configuration */
export const CRON_PRESETS: OptionValue[] = [
    { value: '* * * * *', label: 'Every minute', description: 'Runs every minute' },
    { value: '*/5 * * * *', label: 'Every 5 minutes', description: 'Runs every 5 minutes' },
    { value: '*/15 * * * *', label: 'Every 15 minutes', description: 'Runs every 15 minutes' },
    { value: '*/30 * * * *', label: 'Every 30 minutes', description: 'Runs every 30 minutes' },
    { value: '0 * * * *', label: 'Every hour', description: 'Runs at the start of every hour' },
    { value: '0 */2 * * *', label: 'Every 2 hours', description: 'Runs every 2 hours' },
    { value: '0 */6 * * *', label: 'Every 6 hours', description: 'Runs every 6 hours' },
    { value: '0 0 * * *', label: 'Daily at midnight', description: 'Runs daily at 00:00' },
    { value: '0 6 * * *', label: 'Daily at 6 AM', description: 'Runs daily at 06:00' },
    { value: '0 12 * * *', label: 'Daily at noon', description: 'Runs daily at 12:00' },
    { value: '0 0 * * 1', label: 'Weekly on Monday', description: 'Runs every Monday at midnight' },
    { value: '0 0 1 * *', label: 'Monthly on 1st', description: 'Runs on the 1st of each month' },
];

/** Acknowledgment mode options for message queue consumers */
export const ACK_MODE_OPTIONS: OptionValue[] = [
    { value: AckMode.MANUAL, label: 'Manual', description: 'Acknowledge only after the correlated pipeline run completes successfully' },
];
