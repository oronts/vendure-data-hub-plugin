import type { AuthConfig, RateLimitConfig, RetryConfig } from './extractor.types';
import type { JsonValue } from './json.types';

/**
 * Typed Adapter Configuration Types
 *
 * Strongly-typed interfaces for adapter configurations to prevent
 * runtime errors through compile-time validation.
 */

/**
 * Authentication types for connections.
 * Shared between dashboard, SDK, and backend.
 */
export enum ConnectionAuthType {
    NONE = 'NONE',
    BASIC = 'BASIC',
    BEARER = 'BEARER',
    API_KEY = 'API_KEY',
    OAUTH2 = 'OAUTH2',
    HMAC = 'HMAC',
    JWT = 'JWT',
}

// EXTRACTOR CONFIGS

/** CSV Extractor - Parse uploaded files or explicit inline data */
export interface CsvExtractorConfig {
    adapterCode: 'csv';
    fileId?: string;
    csvText?: string;
    rows?: unknown[];
    delimiter?: string;
    hasHeader?: boolean;
}

/** JSON Extractor - Parse uploaded files or explicit inline data */
export interface JsonExtractorConfig {
    adapterCode: 'json';
    fileId?: string;
    jsonText?: string;
    itemsPath?: string;
}

/** XML Extractor - Parse uploaded files or explicit inline data */
export interface XmlExtractorConfig {
    adapterCode: 'xml';
    fileId?: string;
    xmlText?: string;
    recordPath?: string;
    attributePrefix?: string;
}

/** Excel Extractor - Parse uploaded workbooks */
export interface XlsxExtractorConfig {
    adapterCode: 'xlsx';
    fileId: string;
    sheetName?: string | number;
    hasHeader?: boolean;
}

/** HTTP API Extractor - Fetch data from HTTP/REST APIs with pagination support */
export interface HttpApiExtractorConfig {
    adapterCode: 'httpApi';
    /** API endpoint URL (or path if using connection) */
    url: string;
    /** HTTP method (default: GET) */
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** Request headers */
    headers?: Record<string, string>;
    /** Request body (for POST/PUT/PATCH) */
    body?: Record<string, unknown>;
    /** Connection code for base URL and auth */
    connectionCode?: string;
    /** Response data path (JSON path to records array) */
    dataPath?: string;
    /** Pagination configuration */
    pagination?: {
        type: 'NONE' | 'OFFSET' | 'CURSOR' | 'PAGE' | 'LINK_HEADER';
        /** For offset pagination: offset parameter name */
        offsetParam?: string;
        /** For offset/cursor/page: limit parameter name */
        limitParam?: string;
        /** Records per page */
        limit?: number;
        /** For cursor pagination: cursor parameter name */
        cursorParam?: string;
        /** For cursor pagination: path to cursor in response */
        cursorPath?: string;
        /** For cursor pagination: path to hasMore flag */
        hasMorePath?: string;
        /** For page pagination: page parameter name */
        pageParam?: string;
        /** For page pagination: page size parameter name */
        pageSizeParam?: string;
        /** Maximum pages to fetch (safety limit) */
        maxPages?: number;
    };
    rateLimit?: RateLimitConfig;
    retry?: RetryConfig;
    auth?: AuthConfig;
    timeoutMs?: number;
}

/** GraphQL Extractor - Query GraphQL APIs */
export interface GraphqlExtractorConfig {
    adapterCode: 'graphql';
    /** GraphQL endpoint URL */
    url: string;
    /** GraphQL query */
    query: string;
    /** Query variables */
    variables?: Record<string, unknown>;
    /** Request headers */
    headers?: Record<string, string>;
    /** Full response path to the extracted records. */
    dataPath?: string;
    connectionCode?: string;
    auth?: AuthConfig;
    pagination?: {
        type: 'NONE' | 'OFFSET' | 'CURSOR' | 'RELAY';
        limit?: number;
        maxPages?: number;
        offsetVariable?: string;
        limitVariable?: string;
        cursorVariable?: string;
        pageInfoPath?: string;
        hasNextPagePath?: string;
        endCursorPath?: string;
        totalCountPath?: string;
    };
    timeoutMs?: number;
    operationName?: string;
    includeExtensions?: boolean;
}

/** Vendure Query Extractor - Query Vendure entities */
export interface VendureQueryExtractorConfig {
    adapterCode: 'vendureQuery';
    /** Entity to query */
    entity: 'PRODUCT' | 'PRODUCT_VARIANT' | 'CUSTOMER' | 'ORDER' | 'COLLECTION' | 'FACET' | 'FACET_VALUE' | 'PROMOTION' | 'ASSET';
    /** Relations to load */
    relations?: string[];
    /** Structured filter conditions */
    filters?: Array<{
        field: string;
        operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like' | 'contains';
        value: unknown;
    }>;
    includeFields?: string[];
    excludeFields?: string[];
    channelCodes?: string[];
    languageCode?: string;
    flattenTranslations?: boolean;
    where?: Record<string, unknown>;
    /** Batch size for pagination */
    batchSize?: number;
    /** Sort field */
    sortBy?: string;
    /** Sort direction */
    sortOrder?: 'ASC' | 'DESC';
}

/** Database Extractor - Query SQL databases */
export interface DatabaseExtractorConfig {
    adapterCode: 'database';
    connectionCode?: string;
    databaseType?: 'POSTGRESQL' | 'MYSQL' | 'SQLITE';
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    passwordSecretCode?: string;
    connectionStringSecretCode?: string;
    ssl?: {
        enabled: boolean;
        rejectUnauthorized?: boolean;
        caSecretCode?: string;
        certSecretCode?: string;
        keySecretCode?: string;
    };
    /** SQL query */
    query: string;
    /** Query parameters */
    parameters?: JsonValue[];
    pagination?: {
        enabled: boolean;
        type: 'OFFSET' | 'CURSOR';
        pageSize: number;
        cursorColumn?: string;
        cursorTieBreakerColumn?: string;
        maxPages?: number;
    };
    incremental?: {
        enabled: boolean;
        column: string;
    };
    pool?: {
        max?: number;
        idleTimeoutMs?: number;
    };
    queryTimeoutMs?: number;
}

/** CDC Extractor - Poll for database changes via timestamp or version column */
export interface CdcExtractorConfig {
    adapterCode: 'cdc';
    /** Database type */
    databaseType: 'POSTGRESQL' | 'MYSQL';
    /** Connection code */
    connectionCode: string;
    /** Table to poll */
    table: string;
    /** Column used to detect changes */
    trackingColumn: string;
    /** Tracking type */
    trackingType: 'TIMESTAMP' | 'VERSION';
    /** Primary key column */
    primaryKey: string;
    /** Specific columns to select */
    columns?: string[];
    /** Batch size */
    batchSize?: number;
    /** Track soft-deletes */
    includeDeletes?: boolean;
    /** Delete timestamp column */
    deleteColumn?: string;
}

/** Generic config for custom extractor adapters */
export interface GenericExtractorConfig {
    adapterCode: string;
    [key: string]: unknown;
}

/** Union of all extractor configs */
export type TypedExtractorConfig =
    | CsvExtractorConfig
    | JsonExtractorConfig
    | XlsxExtractorConfig
    | XmlExtractorConfig
    | HttpApiExtractorConfig
    | GraphqlExtractorConfig
    | VendureQueryExtractorConfig
    | DatabaseExtractorConfig
    | CdcExtractorConfig
    | GenericExtractorConfig;

