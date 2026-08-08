/**
 * Feed Handler Types
 *
 * Common types for feed handler functions used by the FeedExecutor.
 */

import { DataHubLogger } from '../../../services/logger';
import { OnRecordErrorCallback, RecordObject } from '../../executor-types';
import { BaseFeedConfig } from '../../config-types';
import { getPath } from '../../utils';
import { majorToMinorUnits, minorToMajorUnits } from '../../../utils/money.utils';
import { FILE_STORAGE, getOutputPath } from '../../../constants';
import { resolveSafeOutputPath, writeFileSafely } from '../../../utils/safe-output-path.utils';

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
    priceUnit: 'MINOR' | 'MAJOR';
    pricePrecision: number;
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

export async function writeFeedFile(
    config: BaseFeedConfig,
    pipelineCode: string,
    extension: string,
    content: string,
): Promise<string> {
    const relativeOutputPath = config.outputPath ?? getOutputPath(pipelineCode, extension);
    const outputPath = await resolveSafeOutputPath(FILE_STORAGE.EXPORT_ROOT, '.', relativeOutputPath);
    await writeFileSafely(outputPath, content);
    return outputPath;
}

/**
 * Extract a string ID from a record, falling back to 'sku' then empty string
 */
export function getRecordId(rec: RecordObject): string {
    const id = getPath(rec, 'id') ?? getPath(rec, 'sku') ?? '';
    return String(id);
}


export function formatFeedAmount(value: unknown, fields: FeedFieldMappings): string {
    const majorUnits = fields.priceUnit === 'MINOR'
        ? minorToMajorUnits(value, fields.pricePrecision)
        : minorToMajorUnits(majorToMinorUnits(value, fields.pricePrecision), fields.pricePrecision);
    return majorUnits.toFixed(fields.pricePrecision);
}

export function formatFeedPrice(value: unknown, fields: FeedFieldMappings): string {
    return `${formatFeedAmount(value, fields)} ${fields.currency}`;
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
        price: formatFeedPrice(getPath(rec, fields.priceField), fields),
        brand: String(getPath(rec, fields.brandField) ?? ''),
        gtin: String(getPath(rec, fields.gtinField) ?? ''),
        availability: String(getPath(rec, fields.availabilityField) ?? 'in stock'),
        condition: 'new',
    };
}
