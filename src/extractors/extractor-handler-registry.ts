/**
 * Centralized extractor handler registry.
 *
 * Single source of truth for extractor adapter definitions AND handler classes.
 * Adding a new extractor requires only:
 * 1. Create the handler class in its directory
 * 2. Add an entry to EXTRACTOR_HANDLER_REGISTRY below
 *
 * The plugin providers array, ExtractorRegistryService, BUILTIN_ADAPTERS,
 * and EXTRACTOR_CODE constants all derive from this registry automatically.
 */
import { Type } from '@vendure/core';
import { DataExtractor, BatchDataExtractor } from '../types/index';
import { AdapterDefinition } from '../sdk/types';
import { HttpApiExtractor } from './http-api';
import { WebhookExtractor } from './webhook';
import { VendureQueryExtractor } from './vendure-query';
import { FileExtractor } from './file';
import { FtpExtractor } from './ftp';
import { S3Extractor } from './s3';
import { DatabaseExtractor } from './database';
import { GraphQLExtractor } from './graphql';
import { CdcExtractor } from './cdc';
import { HTTP_API_EXTRACTOR_SCHEMA } from './http-api/schema';
import { VENDURE_QUERY_EXTRACTOR_SCHEMA } from './vendure-query/schema';
import { GRAPHQL_EXTRACTOR_SCHEMA } from './graphql/schema';
import { CDC_EXTRACTOR_SCHEMA } from './cdc/schema';
import { DATABASE_EXTRACTOR_SCHEMA } from './database/schema';
import { WEBHOOK_EXTRACTOR_SCHEMA } from './webhook/schema';
import { FILE_EXTRACTOR_SCHEMA } from './file/schema';
import { FTP_EXTRACTOR_SCHEMA } from './ftp/schema';
import { S3_EXTRACTOR_SCHEMA } from './s3/schema';

type ExtractorType = DataExtractor | BatchDataExtractor;

/**
 * Registry entry carrying both the handler class and its adapter definition.
 */
interface ExtractorRegistryEntry {
    handler: Type<ExtractorType>;
    definition: AdapterDefinition;
}

/**
 * Maps extractor codes to their NestJS injectable handler classes and adapter definitions.
 *
 * To register a new extractor:
 * 1. Create its handler class and schema
 * 2. Add its entry here with both handler and definition
 */
export const EXTRACTOR_HANDLER_REGISTRY = new Map<string, ExtractorRegistryEntry>([
    ['httpApi', {
        handler: HttpApiExtractor,
        definition: {
            type: 'EXTRACTOR',
            code: 'httpApi',
            description: 'Extract records from HTTP/REST APIs with authentication, pagination (offset, cursor, page, link-header), and rate limiting.',
            icon: 'globe',
            color: '#8b5cf6',
            schema: HTTP_API_EXTRACTOR_SCHEMA,
        },
    }],
    ['webhook', {
        handler: WebhookExtractor,
        definition: {
            type: 'EXTRACTOR',
            code: 'webhook',
            description: 'Process incoming webhook payloads as records.',
            icon: 'webhook',
            color: '#ec4899',
            schema: WEBHOOK_EXTRACTOR_SCHEMA,
        },
    }],
    ['vendureQuery', {
        handler: VendureQueryExtractor,
        definition: {
            type: 'EXTRACTOR',
            code: 'vendureQuery',
            description: 'Extract data from Vendure entities (Products, Customers, Orders, etc.)',
            icon: 'box',
            color: '#6366f1',
            wizardHidden: true,
            schema: VENDURE_QUERY_EXTRACTOR_SCHEMA,
        },
    }],
    ['file', {
        handler: FileExtractor,
        definition: {
            type: 'EXTRACTOR',
            code: 'file',
            description: 'Extract data from local files (CSV, JSON, XML, Excel) with glob patterns.',
            icon: 'file',
            color: '#3b82f6',
            schema: FILE_EXTRACTOR_SCHEMA,
        },
    }],
    ['ftp', {
        handler: FtpExtractor,
        definition: {
            type: 'EXTRACTOR',
            code: 'ftp',
            description: 'Extract data from FTP/SFTP servers.',
            icon: 'upload',
            color: '#14b8a6',
            schema: FTP_EXTRACTOR_SCHEMA,
        },
    }],
    ['s3', {
        handler: S3Extractor,
        definition: {
            type: 'EXTRACTOR',
            code: 's3',
            description: 'Extract data from AWS S3 or S3-compatible storage.',
            icon: 'database',
            color: '#f59e0b',
            schema: S3_EXTRACTOR_SCHEMA,
        },
    }],
    ['database', {
        handler: DatabaseExtractor,
        definition: {
            type: 'EXTRACTOR',
            code: 'database',
            description: 'Extract data from SQL databases (PostgreSQL, MySQL, SQLite, etc.) with pagination and incremental support.',
            icon: 'database',
            color: '#0ea5e9',
            schema: DATABASE_EXTRACTOR_SCHEMA,
        },
    }],
    ['graphql', {
        handler: GraphQLExtractor,
        definition: {
            type: 'EXTRACTOR',
            code: 'graphql',
            description: 'Extract records by querying a GraphQL endpoint with optional cursor pagination.',
            icon: 'code',
            color: '#e11d48',
            schema: GRAPHQL_EXTRACTOR_SCHEMA,
        },
    }],
    ['cdc', {
        handler: CdcExtractor,
        definition: {
            type: 'EXTRACTOR',
            code: 'cdc',
            description: 'Poll a database table for changes using a timestamp or version column (Change Data Capture).',
            icon: 'refresh-cw',
            color: '#0ea5e9',
            schema: CDC_EXTRACTOR_SCHEMA,
        },
    }],
]);

/**
 * Format-only and utility extractors that have no runtime handler class.
 * These are parsed inline by the extract executor.
 */
const FORMAT_ONLY_EXTRACTORS: AdapterDefinition[] = [
    {
        type: 'EXTRACTOR',
        code: 'inMemory',
        description: 'Extract records from in-memory data. Use for webhook payloads, inline data, or test fixtures.',
        icon: 'database',
        color: '#64748b',
        wizardHidden: true,
        schema: {
            fields: [
                { key: 'data', label: 'Data (JSON)', type: 'json', description: 'Array of objects or single object. For webhooks, data is injected from trigger payload.' },
            ],
        },
    },
    {
        type: 'EXTRACTOR',
        code: 'generator',
        description: 'Generate test records with configurable fields and count. Useful for testing pipelines.',
        icon: 'sparkles',
        color: '#f59e0b',
        wizardHidden: true,
        schema: {
            fields: [
                { key: 'count', label: 'Record count', type: 'number', required: true, description: 'Number of records to generate' },
                { key: 'template', label: 'Template (JSON)', type: 'json', description: 'Template object with field generators' },
            ],
        },
    },
    {
        type: 'EXTRACTOR',
        code: 'csv',
        description: 'Extract records from CSV. Use file upload for imports, or csvText/rows for inline data.',
        icon: 'file-text',
        color: '#3b82f6',
        schema: {
            fields: [
                { key: 'fileId', label: 'Upload CSV File', type: 'file', description: 'Upload a CSV file to extract data from. Preferred method for file imports.' },
                { key: 'delimiter', label: 'Delimiter', type: 'string', description: 'Character to separate fields (default: ,)' },
                { key: 'hasHeader', label: 'Header row', type: 'boolean', description: 'Whether first row is header (default: true)' },
                { key: 'csvText', label: 'CSV text (alternative)', type: 'json', description: 'Raw CSV string instead of file upload' },
                { key: 'rows', label: 'Rows (JSON array)', type: 'json', description: 'Alternative to file: array of arrays or objects' },
                { key: 'csvPath', label: 'CSV file path', type: 'string', description: 'Read from filesystem path (dev/testing only)' },
            ],
        },
    },
    {
        type: 'EXTRACTOR',
        code: 'json',
        description: 'Extract records from JSON. Use file upload for imports, or jsonText for inline data.',
        icon: 'file',
        color: '#eab308',
        schema: {
            fields: [
                { key: 'fileId', label: 'Upload JSON File', type: 'file', description: 'Upload a JSON file to extract data from. Preferred method for file imports.' },
                { key: 'itemsPath', label: 'Items path', type: 'string', description: 'Dot-path to array of records (e.g., "data.items")' },
                { key: 'jsonText', label: 'JSON text (alternative)', type: 'json', description: 'Raw JSON string instead of file upload' },
                { key: 'jsonPath', label: 'JSON file path', type: 'string', description: 'Read from filesystem path (dev/testing only)' },
            ],
        },
    },
    {
        type: 'EXTRACTOR',
        code: 'xml',
        description: 'Extract records from XML documents with configurable root and item element paths.',
        icon: 'code',
        color: '#f97316',
        schema: {
            fields: [
                { key: 'fileId', label: 'Upload XML File', type: 'file', description: 'Upload an XML file to extract data from.' },
                { key: 'itemsPath', label: 'Items path', type: 'string', description: 'Dot-path to array of records inside parsed XML' },
                { key: 'rootElement', label: 'Root element', type: 'string', description: 'XML root element name to start parsing from' },
                { key: 'itemElement', label: 'Item element', type: 'string', description: 'Element name for each record (e.g., "product")' },
                { key: 'xmlPath', label: 'XML file path', type: 'string', description: 'Read from filesystem path (dev/testing only)' },
            ],
        },
    },
];

/** All extractor adapter definitions, auto-derived from the registry + format-only extractors */
export const EXTRACTOR_ADAPTERS: AdapterDefinition[] = [
    ...Array.from(EXTRACTOR_HANDLER_REGISTRY.values()).map(e => e.definition),
    ...FORMAT_ONLY_EXTRACTORS,
];

/** All extractor handler classes, for use as NestJS providers */
export const EXTRACTOR_PROVIDERS: Array<Type<ExtractorType>> = Array.from(
    EXTRACTOR_HANDLER_REGISTRY.values(),
).map(e => e.handler);

/**
 * Auto-derived extractor code constants from registry keys + format-only extractors.
 * Keys are SCREAMING_SNAKE_CASE versions of the camelCase registry codes.
 * E.g., 'httpApi' -> EXTRACTOR_CODE.HTTP_API = 'httpApi'
 */
export const EXTRACTOR_CODE = Object.fromEntries(
    [
        ...Array.from(EXTRACTOR_HANDLER_REGISTRY.keys()),
        ...FORMAT_ONLY_EXTRACTORS.map(e => e.code),
    ].map(code => [
        code.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase(),
        code,
    ]),
) as Record<string, string>;
