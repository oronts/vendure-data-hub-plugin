/**
 * Exporter adapter definitions - Data egress to external systems
 */
import { AdapterDefinition } from '../sdk/types';
import { FileEncoding, FileFormat, HttpMethod } from './enums';

export const EXPORTER_ADAPTERS: AdapterDefinition[] = [
    {
        type: 'exporter',
        code: 'csvExport',
        description: 'Export records to CSV file.',
        category: 'external',
        schema: {
            fields: [
                { key: 'path', label: 'Output directory', type: 'string', required: true, description: 'Directory path for output (e.g., ./exports)' },
                { key: 'filenamePattern', label: 'Filename pattern', type: 'string', description: 'Filename with placeholders: ${date:YYYY-MM-DD}, ${timestamp}, ${uuid}' },
                { key: 'delimiter', label: 'Delimiter', type: 'select', options: [
                    { value: ',', label: 'Comma (,)' },
                    { value: ';', label: 'Semicolon (;)' },
                    { value: '\t', label: 'Tab' },
                    { value: '|', label: 'Pipe (|)' },
                ] },
                { key: 'includeHeader', label: 'Include header row', type: 'boolean' },
                { key: 'columns', label: 'Columns', type: 'json', description: 'Array of column definitions: [{ field: "name", header: "Name" }]' },
                { key: 'encoding', label: 'Encoding', type: 'select', options: [
                    { value: FileEncoding.UTF8, label: 'UTF-8' },
                    { value: FileEncoding.UTF16, label: 'UTF-16' },
                    { value: FileEncoding.ISO_8859_1, label: 'ISO-8859-1' },
                ] },
                { key: 'connectionCode', label: 'Connection', type: 'string', description: 'SFTP/S3 connection for remote upload' },
            ],
        },
    },
    {
        type: 'exporter',
        code: 'jsonExport',
        description: 'Export records to JSON file.',
        category: 'external',
        schema: {
            fields: [
                { key: 'path', label: 'Output directory', type: 'string', required: true, description: 'Directory path for output' },
                { key: 'filenamePattern', label: 'Filename pattern', type: 'string', description: 'Filename with placeholders: ${date:YYYY-MM-DD}, ${timestamp}, ${uuid}' },
                { key: 'format', label: 'Format', type: 'select', options: [
                    { value: FileFormat.JSON, label: 'JSON (array)' },
                    { value: FileFormat.NDJSON, label: 'NDJSON (line-delimited)' },
                ] },
                { key: 'pretty', label: 'Pretty print', type: 'boolean' },
                { key: 'connectionCode', label: 'Connection', type: 'string' },
            ],
        },
    },
    {
        type: 'exporter',
        code: 'xmlExport',
        description: 'Export records to XML file.',
        category: 'external',
        schema: {
            fields: [
                { key: 'path', label: 'Output directory', type: 'string', required: true, description: 'Directory path for output' },
                { key: 'filenamePattern', label: 'Filename pattern', type: 'string', description: 'Filename with placeholders: ${date:YYYY-MM-DD}, ${timestamp}, ${uuid}' },
                { key: 'rootElement', label: 'Root element', type: 'string', description: 'e.g., products' },
                { key: 'itemElement', label: 'Item element', type: 'string', description: 'e.g., product' },
                { key: 'declaration', label: 'Include XML declaration', type: 'boolean' },
                { key: 'connectionCode', label: 'Connection', type: 'string' },
            ],
        },
    },
    {
        type: 'exporter',
        code: 'restPost',
        description: 'Export records via REST API POST.',
        category: 'external',
        schema: {
            fields: [
                { key: 'endpoint', label: 'Endpoint URL', type: 'string', required: true },
                { key: 'method', label: 'HTTP Method', type: 'select', options: [
                    { value: HttpMethod.POST, label: 'POST' },
                    { value: HttpMethod.PUT, label: 'PUT' },
                    { value: HttpMethod.PATCH, label: 'PATCH' },
                ] },
                { key: 'batchMode', label: 'Batch mode', type: 'select', options: [
                    { value: 'single', label: 'One request per record' },
                    { value: 'batch', label: 'Batch all records in one request' },
                ] },
                { key: 'batchSize', label: 'Batch size', type: 'number', description: 'Records per batch request' },
                { key: 'connectionCode', label: 'Connection', type: 'string' },
                { key: 'bearerTokenSecretCode', label: 'Bearer token secret', type: 'string' },
                { key: 'retryCount', label: 'Retry count', type: 'number' },
            ],
        },
    },
    {
        type: 'exporter',
        code: 'webhookExport',
        description: 'Send records to webhook endpoint.',
        category: 'external',
        schema: {
            fields: [
                { key: 'url', label: 'Webhook URL', type: 'string', required: true },
                { key: 'signatureSecretCode', label: 'Signature secret', type: 'string', description: 'Secret for HMAC signature' },
                { key: 'headers', label: 'Custom headers', type: 'json' },
                { key: 'retryCount', label: 'Retry count', type: 'number' },
                { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number' },
            ],
        },
    },
];
