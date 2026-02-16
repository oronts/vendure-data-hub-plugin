/**
 * Placeholder Text Constants
 *
 * Centralized placeholder text for form inputs and sample data.
 * Eliminates hardcoded strings scattered across components.
 */

export const PLACEHOLDERS = {
    // Field inputs
    FIELD_NAME: 'Field name (e.g., sku, price)',
    REGEX_PATTERN: 'Regex pattern (e.g., ^[A-Z]{3}-\\d+$)',
    ERROR_MESSAGE: 'Error message (optional)',

    // JSON inputs
    JSON_SAMPLE: '{"key": "value"}',
    JSON_ARRAY_SAMPLE: '[{"id": 1}, {"id": 2}]',
    SAMPLE_RECORDS: '[{ "id": "1", "name": "Example" }]',

    // Authentication
    API_KEY: 'your-api-key',
    BEARER_TOKEN: 'your-bearer-token',
    BASIC_USERNAME: 'username',
    BASIC_PASSWORD: 'password',
    API_KEY_SECRET: 'api-key-secret',
    PASSWORD_SECRET: 'password-secret',
    API_KEY_HEADER: 'X-API-Key',
    SERVICE_USER: 'service-user',

    // Connection
    HOST: 'localhost',
    PORT: '5432',
    DATABASE_NAME: 'my_database',
    TABLE_NAME: 'my_table',

    // URLs
    API_URL: 'https://api.example.com/v1',
    WEBHOOK_URL: 'https://example.com/webhook',

    // Headers
    HEADER_NAME: 'X-Custom-Header',
    HEADER_VALUE: 'header-value',

    // Codes and identifiers
    PIPELINE_NAME: 'My Pipeline',
    PIPELINE_CODE: 'my-pipeline-code',
    SECRET_CODE: 'my-secret',
    CONNECTION_CODE: 'my-connection',

    // Query inputs
    SQL_QUERY: 'SELECT * FROM table WHERE status = $1',
    GRAPHQL_QUERY: '{ products { id name } }',

    // File paths
    FILE_PATH: '/path/to/file.csv',
    OUTPUT_DIRECTORY: '/output',

    // Cron
    CRON_EXPRESSION: '0 */6 * * *',
} as const;

/**
 * Default sample data for testing
 */
export const DEFAULT_SAMPLE_DATA = `[
  { "id": "1", "sku": "SKU-001", "name": "Product One", "price": 99.99 },
  { "id": "2", "sku": "SKU-002", "name": "Product Two", "price": 149.99 }
]`;

/**
 * Step test descriptions
 */
export const STEP_TEST_DESCRIPTIONS = {
    EXTRACT: 'Extracts data using the configured adapter and returns sample records.',
    TRANSFORM: 'Applies configured transformations to these records.',
    VALIDATE: 'Runs validation rules on these records.',
    LOAD: 'Loads records into the target system.',
} as const;
