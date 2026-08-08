import type {
    AuthConfig,
    RateLimitConfig,
    RetryConfig,
} from '../../../shared/types';
import { ConnectionAuthType } from '../../constants/enums';
import type {
    JsonObject,
    JsonValue,
    SchemaReference,
    Throughput,
} from '../../types/index';
import type {
    ChannelStrategy,
    ConflictStrategyValue,
    LanguageStrategyValue,
    LoadStrategy,
    ValidationModeType,
} from '../types/index';

export interface ExtractStepConfig {
    adapterCode: string;
    url?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers?: Record<string, string>;
    query?: JsonObject | string;
    body?: JsonObject;
    pagination?: JsonObject;
    dataPath?: string;
    fileId?: string;
    csvText?: string;
    jsonText?: string;
    xmlText?: string;
    itemsPath?: string;
    recordPath?: string;
    attributePrefix?: string;
    sheetName?: string | number;
    delimiter?: string;
    hasHeader?: boolean;
    rows?: JsonValue[];
    variables?: JsonObject;
    operationName?: string;
    includeExtensions?: boolean;
    count?: number;
    template?: JsonObject;
    entity?: string;
    relations?: string[];
    flattenTranslations?: boolean;
    languageCode?: string;
    includeFields?: string[];
    excludeFields?: string[];
    connectionCode?: string;
    auth?: AuthConfig;
    rateLimit?: RateLimitConfig;
    retry?: RetryConfig;
    timeoutMs?: number;
    bearerTokenSecretCode?: string;
    basicSecretCode?: string;
    hmacSecretCode?: string;
    mapFields?: Record<string, string>;
    throughput?: Throughput;
    async?: boolean;
    /** Validate extracted records against this immutable registry version. */
    schemaRef?: SchemaReference;
    [key: string]: unknown;
}

export interface LoadStepConfig {
    adapterCode: string;
    strategy?: LoadStrategy;
    channel?: string;
    /** Per-step channel selection strategy, emitted as step context. */
    channelStrategy?: ChannelStrategy;
    /** Vendure channel IDs for EXPLICIT or MULTI execution. */
    channelIds?: string[];
    languageStrategy?: LanguageStrategyValue;
    validationMode?: ValidationModeType;
    conflictStrategy?: ConflictStrategyValue;
    nameField?: string;
    slugField?: string;
    descriptionField?: string;
    skuField?: string;
    priceField?: string;
    emailField?: string;
    firstNameField?: string;
    lastNameField?: string;
    phoneNumberField?: string;
    customerGroupField?: string;
    codeField?: string;
    parentField?: string;
    positionField?: string;
    stockField?: string;
    stockOnHandField?: string;
    stockAllocatedField?: string;
    stockLocationField?: string;
    urlField?: string;
    enabledField?: string;
    prefix?: string;
    endpoint?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers?: Record<string, string>;
    auth?: ConnectionAuthType;
    bearerTokenSecretCode?: string;
    basicSecretCode?: string;
    hmacSecretCode?: string;
    hmacHeader?: string;
    batchMode?: 'single' | 'array' | 'batch';
    maxBatchSize?: number;
    retries?: number;
    retryDelayMs?: number;
    timeoutMs?: number;
    config?: JsonObject;
    throughput?: Throughput;
    async?: boolean;
    [key: string]: unknown;
}
