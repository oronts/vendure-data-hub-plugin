/**
 * Shared helpers for sink, feed, and export executors.
 *
 * Provides translation flattening and channel filtering at the executor level,
 * keeping all 16 individual handlers untouched.
 * Also provides buildSandboxLoaderContext() for handler files that bridge
 * LoaderHandler to BaseEntityLoader.
 */
import { RequestContext } from '@vendure/core';
import { RecordObject, SANDBOX_PIPELINE_ID } from './executor-types';
import { LoaderContext } from '../types/index';
import { TARGET_OPERATION, LoadStrategy } from '../constants/enums';

/**
 * Flatten a record's nested translations array for a specific language.
 *
 * Given a record like:
 *   { id: 1, translations: [{ languageCode: 'en', name: 'Shoe' }, { languageCode: 'de', name: 'Schuh' }] }
 *
 * Calling with languageCode='de' produces:
 *   { id: 1, name: 'Schuh' }
 *
 * If no matching language is found, falls back to the first translation.
 * If no translations field exists, returns the record unchanged.
 */
export function flattenRecordTranslations(
    record: RecordObject,
    languageCode: string,
    translationsField: string = 'translations',
): RecordObject {
    const translations = record[translationsField];
    if (!Array.isArray(translations) || translations.length === 0) {
        return record;
    }

    // Find matching translation (exact match, then fallback to first)
    const match = translations.find(
        (t: unknown) => t && typeof t === 'object' && (t as Record<string, unknown>).languageCode === languageCode,
    ) ?? translations[0];

    if (!match || typeof match !== 'object') {
        return record;
    }

    // Clone record without the translations array, then merge translated fields
    const result: RecordObject = {};
    for (const [key, value] of Object.entries(record)) {
        if (key === translationsField) continue;
        result[key] = value;
    }

    const translation = match as Record<string, unknown>;
    for (const [key, value] of Object.entries(translation)) {
        // Skip metadata fields from the translation object
        if (key === 'languageCode' || key === 'id') continue;
        if (typeof value === 'function' || value === undefined) continue;
        // Deep clone objects/arrays to prevent mutations from affecting original translations
        result[key] = (value !== null && typeof value === 'object')
            ? JSON.parse(JSON.stringify(value))
            : value as RecordObject[string];
    }

    return result;
}

/**
 * Filter records to only those belonging to a specific channel.
 *
 * Checks the record's channels array (or custom channelField) for a matching
 * channel code. If no channelCode is configured, returns all records (no-op).
 */
export function filterRecordsByChannel(
    records: RecordObject[],
    channelCode: string,
    channelField: string = 'channels',
): RecordObject[] {
    return records.filter(record => {
        const channels = record[channelField];
        if (!Array.isArray(channels)) {
            // If record has no channels array, include it (don't filter out)
            return true;
        }
        return channels.some((ch: unknown) => {
            if (typeof ch === 'string') return ch === channelCode;
            if (ch && typeof ch === 'object') return (ch as Record<string, unknown>).code === channelCode;
            return false;
        });
    });
}

/**
 * Apply localization processing to a batch of records.
 * Combines channel filtering and translation flattening in a single pass.
 */
export function applyLocalization(
    records: RecordObject[],
    config: {
        languageCode?: string;
        translationsField?: string;
        channelCode?: string;
        channelField?: string;
    },
): RecordObject[] {
    let result = records;

    // Channel filtering first (reduces set before translation work)
    if (config.channelCode) {
        result = filterRecordsByChannel(result, config.channelCode, config.channelField);
    }

    // Translation flattening
    if (config.languageCode) {
        result = result.map(rec =>
            flattenRecordTranslations(rec, config.languageCode!, config.translationsField),
        );
    }

    return result;
}

/**
 * Apply language code template to an index/collection name.
 * Replaces `${languageCode}` placeholder with the actual language code.
 * E.g., `products-${languageCode}` → `products-en`
 */
export function resolveIndexName(indexName: string, languageCode?: string): string {
    if (!languageCode) return indexName;
    return indexName.replace(/\$\{languageCode\}/g, languageCode);
}

// ==========================================
// Sandbox Loader Context
// ==========================================

/**
 * Configuration shape accepted by buildSandboxLoaderContext.
 * Matches the common subset used by customer-group, stock-location,
 * order-upsert, and inventory-adjust handler configs.
 */
export interface SandboxHandlerConfig {
    strategy?: LoadStrategy;
    operation?: string;
    lookupFields?: string | string[];
}

/**
 * Map a LoadStrategy enum value to a TARGET_OPERATION string.
 * Shared by all handler files that bridge LoaderHandler → BaseEntityLoader.
 */
export function mapStrategyToOperation(strategy: LoadStrategy): string {
    switch (strategy) {
        case LoadStrategy.CREATE: return TARGET_OPERATION.CREATE;
        case LoadStrategy.UPDATE: return TARGET_OPERATION.UPDATE;
        default: return TARGET_OPERATION.UPSERT;
    }
}

/**
 * Build a LoaderContext for handler files that execute loaders in
 * "sandbox" mode (outside a real pipeline run).
 *
 * Channel isolation is provided by the ctx (RequestContext) from the
 * pipeline run. SANDBOX_PIPELINE_ID ('0') is used as a metadata
 * placeholder for logging/tracking only.
 *
 * @param ctx - The request context carrying channel/auth information
 * @param cfg - Handler config with strategy, operation, and lookupFields
 * @param defaultLookupFields - Fallback lookup fields (default: ['code'])
 */
export function buildSandboxLoaderContext(
    ctx: RequestContext,
    cfg: SandboxHandlerConfig,
    defaultLookupFields: string[] = ['code'],
): LoaderContext {
    const operation = cfg.strategy
        ? mapStrategyToOperation(cfg.strategy)
        : (cfg.operation ?? TARGET_OPERATION.UPSERT);

    return {
        ctx,
        pipelineId: SANDBOX_PIPELINE_ID,
        runId: SANDBOX_PIPELINE_ID,
        operation: operation as LoaderContext['operation'],
        lookupFields: Array.isArray(cfg.lookupFields)
            ? cfg.lookupFields
            : typeof cfg.lookupFields === 'string'
                ? cfg.lookupFields.split(',').map(f => f.trim())
                : defaultLookupFields,
        dryRun: false,
        options: { skipDuplicates: false },
    };
}
