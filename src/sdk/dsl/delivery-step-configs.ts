import { ExportFormatType } from '../../constants/enums';
import type { JsonObject, Throughput } from '../../types/index';
import type { FeedFormat, FeedType } from '../types/index';

type ExportDestinationType = 'LOCAL' | 'HTTP' | 'S3' | 'SFTP' | 'FTP' | 'EMAIL';

export interface ExportStepConfig {
    adapterCode: string;
    destinationType?: ExportDestinationType;
    format?: ExportFormatType;
    path?: string;
    filenamePattern?: string;
    compress?: boolean | 'gzip' | 'zip';
    url?: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    /** Non-sensitive static headers. Credentials must use auth or headerSecretCodes. */
    headers?: Record<string, string>;
    /** Maps HTTP header names to Data Hub Secret Codes. */
    headerSecretCodes?: Record<string, string>;
    auth?: {
        type: 'NONE' | 'BASIC' | 'BEARER' | 'API_KEY';
        secretCode?: string;
        headerName?: string;
        username?: string;
        usernameSecretCode?: string;
    };
    bucket?: string;
    region?: string;
    prefix?: string;
    accessKeyIdSecretCode?: string;
    secretAccessKeySecretCode?: string;
    acl?: 'private' | 'public-read';
    host?: string;
    port?: number;
    username?: string;
    passwordSecretCode?: string;
    privateKeySecretCode?: string;
    passphraseSecretCode?: string;
    hostKeyFingerprintSecretCode?: string;
    remotePath?: string;
    to?: string | string[];
    subject?: string;
    attachFilename?: string;
    smtp?: {
        host: string;
        port: number;
        secure?: boolean;
        username?: string;
        usernameSecretCode?: string;
        passwordSecretCode?: string;
    };
    delimiter?: string;
    includeHeader?: boolean;
    formulaMode?: 'SPREADSHEET_SAFE' | 'PRESERVE';
    quoteStrings?: boolean;
    rootElement?: string;
    itemElement?: string;
    declaration?: boolean;
    wrapInObject?: string;
    fields?: string[];
    excludeFields?: string[];
    fieldMapping?: Record<string, string>;
    batchSize?: number;
    maxRecordsPerFile?: number;
    languageCode?: string;
    translationsField?: string;
    channelCode?: string;
    channelField?: string;
    connectionCode?: string;
    bearerTokenSecretCode?: string;
    basicSecretCode?: string;
    config?: JsonObject;
    throughput?: Throughput;
    async?: boolean;
    [key: string]: unknown;
}

export interface FeedStepConfig {
    adapterCode: string;
    feedType?: FeedType;
    format?: FeedFormat;
    outputPath?: string;
    outputUrl?: string;
    bucket?: string;
    prefix?: string;
    merchantId?: string;
    targetCountry?: string;
    contentLanguage?: string;
    currency?: string;
    storeUrl?: string;
    storeName?: string;
    catalogId?: string;
    businessId?: string;
    sellerId?: string;
    marketplaceId?: string;
    includeVariants?: boolean;
    includeOutOfStock?: boolean;
    priceIncludesTax?: boolean;
    channelCode?: string;
    titleField?: string;
    descriptionField?: string;
    priceField?: string;
    /** Unit stored in priceField; built-in feeds default to Vendure-native minor units. */
    priceUnit?: 'MINOR' | 'MAJOR';
    salePriceField?: string;
    imageField?: string;
    linkField?: string;
    brandField?: string;
    gtinField?: string;
    mpnField?: string;
    categoryField?: string;
    availabilityField?: string;
    conditionField?: string;
    /** Custom feed output field to source record path mapping. */
    fieldMapping?: Record<string, string>;
    refreshIntervalMinutes?: number;
    languageCode?: string;
    translationsField?: string;
    channelField?: string;
    connectionCode?: string;
    apiKeySecretCode?: string;
    config?: JsonObject;
    throughput?: Throughput;
}

export interface SinkStepConfig {
    adapterCode: string;
    defaultOperation?: 'UPSERT' | 'DELETE';
    host?: string;
    /** Elasticsearch/OpenSearch node URL (e.g., http://localhost:9200) */
    node?: string;
    port?: number;
    protocol?: 'http' | 'https';
    indexName?: string;
    appId?: string;
    primaryKey?: string;
    searchableFields?: string[];
    filterableFields?: string[];
    sortableFields?: string[];
    collectionName?: string;
    idField?: string;
    batchSize?: number;
    fields?: string[];
    excludeFields?: string[];
    languageCode?: string;
    translationsField?: string;
    channelCode?: string;
    channelField?: string;
    connectionCode?: string;
    apiKeySecretCode?: string;
    usernameSecretCode?: string;
    passwordSecretCode?: string;
    queueType?: 'RABBITMQ' | 'RABBITMQ_AMQP' | 'SQS' | 'REDIS_STREAMS';
    queueName?: string;
    routingKey?: string;
    headers?: Record<string, string>;
    persistent?: boolean;
    priority?: number;
    ttlMs?: number;
    url?: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    bearerTokenSecretCode?: string;
    apiKeyHeader?: string;
    hmacSecretCode?: string;
    signatureHeaderName?: string;
    timeoutMs?: number;
    retries?: number;
    config?: JsonObject;
    throughput?: Throughput;
    async?: boolean;
}
