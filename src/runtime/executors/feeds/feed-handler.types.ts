/**
 * Feed Handler Types
 *
 * Common types for feed handler functions used by the FeedExecutor.
 */

import { DataHubLogger } from '../../../services/logger';
import { OnRecordErrorCallback, RecordObject } from '../../executor-types';
import { BaseFeedConfig } from '../../config-types';
import { getPath } from '../../utils';

/**
 * Common field mappings resolved from feed configuration
 */
export interface FeedFieldMappings {
    titleField: string;
    descriptionField: string;
    priceField: string;
    imageField: string;
    linkField: string;
    brandField: string;
    gtinField: string;
    availabilityField: string;
    currency: string;
}

/**
 * Parameters passed to each feed handler function
 */
export interface FeedHandlerParams {
    stepKey: string;
    config: BaseFeedConfig;
    records: RecordObject[];
    fields: FeedFieldMappings;
    onRecordError?: OnRecordErrorCallback;
    logger: DataHubLogger;
}

/**
 * Result returned by each feed handler function
 */
export interface FeedHandlerResult {
    ok: number;
    fail: number;
    outputPath?: string;
}

/**
 * Function signature for built-in feed handlers
 */
export type FeedHandlerFn = (params: FeedHandlerParams) => Promise<FeedHandlerResult>;

/**
 * Extract a string ID from a record, falling back to 'sku' then empty string
 */
export function getRecordId(rec: RecordObject): string {
    const id = getPath(rec, 'id') ?? getPath(rec, 'sku') ?? '';
    return String(id);
}

/**
 * Map a record to a standard feed item using the configured field mappings
 */
export function mapToFeedItem(rec: RecordObject, fields: FeedFieldMappings): Record<string, string> {
    return {
        id: getRecordId(rec),
        title: String(getPath(rec, fields.titleField) ?? ''),
        description: String(getPath(rec, fields.descriptionField) ?? ''),
        link: String(getPath(rec, fields.linkField) ?? ''),
        image_link: String(getPath(rec, fields.imageField) ?? ''),
        price: `${getPath(rec, fields.priceField) ?? 0} ${fields.currency}`,
        brand: String(getPath(rec, fields.brandField) ?? ''),
        gtin: String(getPath(rec, fields.gtinField) ?? ''),
        availability: String(getPath(rec, fields.availabilityField) ?? 'in stock'),
        condition: 'new',
    };
}
