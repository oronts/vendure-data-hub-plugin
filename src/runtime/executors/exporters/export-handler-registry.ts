/**
 * Export Handler Registry
 *
 * Single source of truth for exporter adapter definitions AND handler functions.
 * Adding a new export handler requires only:
 * 1. Create the handler file in this directory
 * 2. Add its entry to EXPORT_HANDLER_REGISTRY below
 *
 * BUILTIN_ADAPTERS, EXPORTER_CODE constants, and the ExportExecutor
 * all derive from this registry automatically.
 */
import { AdapterDefinition } from '../../../sdk/types';
import {
    HTTP_METHOD_EXPORT_OPTIONS,
    CSV_DELIMITER_OPTIONS,
    FILE_ENCODING_OPTIONS,
    JSON_EXPORT_FORMAT_OPTIONS,
    BATCH_MODE_EXPORT_OPTIONS,
} from '../../../constants/adapter-schema-options';
import { ExportHandlerFn } from './export-handler.types';
import { csvExportHandler } from './csv-export.handler';
import { jsonExportHandler } from './json-export.handler';
import { xmlExportHandler } from './xml-export.handler';
import { httpExportHandler } from './http-export.handler';

/**
 * Registry entry carrying both the handler function and its adapter definition.
 */
interface ExportRegistryEntry {
    handler: ExportHandlerFn;
    definition: AdapterDefinition;
}

/**
 * Maps each exporter code to its corresponding handler function and adapter definition.
 * Used by ExportExecutor for dispatch and BUILTIN_ADAPTERS for UI rendering.
 */
export const EXPORT_HANDLER_REGISTRY = new Map<string, ExportRegistryEntry>([
    ['csvExport', {
        handler: csvExportHandler,
        definition: {
            type: 'EXPORTER',
            code: 'csvExport',
            name: 'CSV',
            description: 'Export records to CSV file.',
            category: 'EXTERNAL',
            icon: 'file-text',
            color: '#3b82f6',
            formatType: 'CSV',
            schema: {
                fields: [
                    { key: 'path', label: 'Output directory', type: 'string', required: true, description: 'Directory path for output (e.g., ./exports)' },
                    { key: 'filenamePattern', label: 'Filename pattern', type: 'string', description: 'Filename with placeholders: ${date:YYYY-MM-DD}, ${timestamp}, ${uuid}' },
                    { key: 'delimiter', label: 'Delimiter', type: 'select', options: CSV_DELIMITER_OPTIONS, group: 'format-options' },
                    { key: 'includeHeader', label: 'Include header row', type: 'boolean', group: 'format-options' },
                    { key: 'columns', label: 'Columns', type: 'json', description: 'Array of column definitions: [{ field: "name", header: "Name" }]' },
                    { key: 'encoding', label: 'Encoding', type: 'select', options: FILE_ENCODING_OPTIONS, group: 'format-options' },
                    { key: 'connectionCode', label: 'Connection', type: 'string', description: 'SFTP/S3 connection for remote upload' },
                ],
            },
        },
    }],
    ['jsonExport', {
        handler: jsonExportHandler,
        definition: {
            type: 'EXPORTER',
            code: 'jsonExport',
            name: 'JSON',
            description: 'Export records to JSON file.',
            category: 'EXTERNAL',
            icon: 'file',
            color: '#eab308',
            formatType: 'JSON',
            schema: {
                fields: [
                    { key: 'path', label: 'Output directory', type: 'string', required: true, description: 'Directory path for output' },
                    { key: 'filenamePattern', label: 'Filename pattern', type: 'string', description: 'Filename with placeholders: ${date:YYYY-MM-DD}, ${timestamp}, ${uuid}' },
                    { key: 'format', label: 'Format', type: 'select', options: JSON_EXPORT_FORMAT_OPTIONS, group: 'format-options' },
                    { key: 'pretty', label: 'Pretty print', type: 'boolean', group: 'format-options' },
                    { key: 'connectionCode', label: 'Connection', type: 'string' },
                ],
            },
        },
    }],
    ['xmlExport', {
        handler: xmlExportHandler,
        definition: {
            type: 'EXPORTER',
            code: 'xmlExport',
            name: 'XML',
            description: 'Export records to XML file.',
            category: 'EXTERNAL',
            icon: 'code',
            color: '#f97316',
            formatType: 'XML',
            schema: {
                fields: [
                    { key: 'path', label: 'Output directory', type: 'string', required: true, description: 'Directory path for output' },
                    { key: 'filenamePattern', label: 'Filename pattern', type: 'string', description: 'Filename with placeholders: ${date:YYYY-MM-DD}, ${timestamp}, ${uuid}' },
                    { key: 'rootElement', label: 'Root element', type: 'string', defaultValue: 'feed', description: 'e.g., products', group: 'format-options' },
                    { key: 'itemElement', label: 'Item element', type: 'string', defaultValue: 'item', description: 'e.g., product', group: 'format-options' },
                    { key: 'declaration', label: 'Include XML declaration', type: 'boolean', group: 'format-options' },
                    { key: 'connectionCode', label: 'Connection', type: 'string' },
                ],
            },
        },
    }],
    ['restPostExport', {
        handler: httpExportHandler,
        definition: {
            type: 'EXPORTER',
            code: 'restPostExport',
            name: 'REST POST',
            description: 'Export records via REST API POST.',
            category: 'EXTERNAL',
            icon: 'globe',
            color: '#8b5cf6',
            schema: {
                fields: [
                    { key: 'url', label: 'Endpoint URL', type: 'string', required: true },
                    { key: 'method', label: 'HTTP Method', type: 'select', options: HTTP_METHOD_EXPORT_OPTIONS },
                    { key: 'batchMode', label: 'Batch mode', type: 'select', options: BATCH_MODE_EXPORT_OPTIONS },
                    { key: 'batchSize', label: 'Batch size', type: 'number', description: 'Records per batch request' },
                    { key: 'connectionCode', label: 'Connection', type: 'string' },
                    { key: 'bearerTokenSecretCode', label: 'Bearer token secret', type: 'string' },
                    { key: 'retryCount', label: 'Retry count', type: 'number' },
                ],
            },
        },
    }],
    ['webhookExport', {
        handler: httpExportHandler,
        definition: {
            type: 'EXPORTER',
            code: 'webhookExport',
            name: 'Webhook',
            description: 'Send records to webhook endpoint.',
            category: 'EXTERNAL',
            icon: 'webhook',
            color: '#ec4899',
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
    }],
]);

/** All exporter adapter definitions, auto-derived from the registry */
export const EXPORTER_ADAPTERS: AdapterDefinition[] =
    Array.from(EXPORT_HANDLER_REGISTRY.values()).map(e => e.definition);

/**
 * Auto-derived exporter code constants from registry keys.
 * Keys are SCREAMING_SNAKE_CASE versions of the camelCase registry codes.
 * E.g., 'csvExport' -> EXPORTER_CODE.CSV_EXPORT = 'csvExport'
 */
export const EXPORTER_CODE = Object.fromEntries(
    Array.from(EXPORT_HANDLER_REGISTRY.keys()).map(code => [
        code.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase(),
        code,
    ]),
) as Record<string, string>;

/**
 * Auto-derived export format → adapter code mappings.
 * Only includes file-based exporters (those with formatType).
 * Served via GraphQL configOptions for the wizard's format-to-adapter resolution.
 */
export const EXPORT_ADAPTER_CODES: Array<{ value: string; label: string; adapterCode: string }> =
    Array.from(EXPORT_HANDLER_REGISTRY.values())
        .filter(e => e.definition.formatType)
        .map(e => ({
            value: e.definition.formatType!,
            label: e.definition.name ?? e.definition.formatType!,
            adapterCode: e.definition.code,
        }));
