/**
 * S3 File Handlers
 *
 * Utilities for handling S3 object filtering, parsing, and post-processing.
 * Uses shared utilities from extractors/shared to eliminate duplication.
 */

import { S3ObjectInfo, S3ExtractorConfig, S3ObjectMetadata } from './types';
import { FileParserService } from '../../parsers/file-parser.service';
import { JsonObject } from '../../types/index';
import {
    detectFileFormat as sharedDetectFileFormat,
    parseFileContent,
    parseModifiedAfterDate as sharedParseModifiedAfterDate,
} from '../shared';

/**
 * Filter objects by suffix
 */
export function filterBySuffix(objects: S3ObjectInfo[], suffix?: string): S3ObjectInfo[] {
    if (!suffix) return objects;
    return objects.filter(obj => obj.key.endsWith(suffix));
}

/**
 * Filter objects by modification date
 */
export function filterByModifiedAfter(
    objects: S3ObjectInfo[],
    modifiedAfter?: string,
): S3ObjectInfo[] {
    if (!modifiedAfter) return objects;

    const afterDate = new Date(modifiedAfter);
    if (isNaN(afterDate.getTime())) return objects;

    return objects.filter(obj => obj.lastModified >= afterDate);
}

/**
 * Filter objects based on configuration
 */
export function filterObjects(
    objects: S3ObjectInfo[],
    config: S3ExtractorConfig,
): S3ObjectInfo[] {
    let filtered = objects;

    // Filter by suffix
    filtered = filterBySuffix(filtered, config.suffix);

    // Filter by modification date
    filtered = filterByModifiedAfter(filtered, config.modifiedAfter);

    // Filter out directories (keys ending with /)
    filtered = filtered.filter(obj => !obj.key.endsWith('/'));

    return filtered;
}

/**
 * Detect file format from object key
 * Uses shared implementation to eliminate duplication
 */
export const detectFileFormat = sharedDetectFileFormat;

/**
 * Parse S3 object content
 * Uses shared parseFileContent to eliminate duplication
 */
export async function parseS3Content(
    content: Buffer,
    key: string,
    config: S3ExtractorConfig,
    fileParser: FileParserService,
): Promise<JsonObject[]> {
    return parseFileContent(
        content,
        key,
        {
            format: config.format,
            csv: config.csv,
            json: config.json,
            xml: config.xml,
            xlsx: config.xlsx,
        },
        fileParser,
    );
}

/**
 * Build object metadata for attaching to records
 */
export function buildObjectMetadata(
    bucket: string,
    obj: S3ObjectInfo,
): S3ObjectMetadata {
    return {
        bucket,
        key: obj.key,
        size: obj.size,
        etag: obj.etag,
        lastModified: obj.lastModified.toISOString(),
    };
}

/**
 * Attach S3 metadata to record
 */
export function attachMetadataToRecord(
    record: JsonObject,
    metadata: S3ObjectMetadata,
): JsonObject {
    return {
        ...record,
        _s3: metadata as unknown as JsonObject,
    };
}

/**
 * Calculate destination key for move operation
 */
export function calculateDestinationKey(
    sourceKey: string,
    sourcePrefix: string | undefined,
    destinationPrefix: string,
): string {
    if (sourcePrefix && sourceKey.startsWith(sourcePrefix)) {
        // Replace source prefix with destination prefix
        return destinationPrefix + sourceKey.slice(sourcePrefix.length);
    }

    // Prepend destination prefix
    return destinationPrefix + sourceKey.split('/').pop();
}

/**
 * Validate bucket name format
 */
export function isValidBucketName(name: string): boolean {
    // S3 bucket naming rules:
    // - 3-63 characters
    // - lowercase letters, numbers, hyphens, periods
    // - must start and end with letter or number
    // - no adjacent periods
    // - not formatted as IP address

    if (name.length < 3 || name.length > 63) return false;

    // Basic pattern check
    if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(name)) return false;

    // No adjacent periods
    if (/\.\./.test(name)) return false;

    // Not an IP address
    if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return false;

    return true;
}

/**
 * Validate prefix format (should not start with /)
 */
export function isValidPrefix(prefix: string): boolean {
    return !prefix.startsWith('/');
}

/**
 * Parse ISO date string safely
 * Uses shared implementation to eliminate duplication
 */
export const parseModifiedAfterDate = sharedParseModifiedAfterDate;

/**
 * Estimate total objects to process based on listing
 */
export function estimateObjectCount(
    objects: S3ObjectInfo[],
    isTruncated: boolean,
    maxObjects: number,
): number {
    if (!isTruncated) {
        return Math.min(objects.length, maxObjects);
    }
    // If truncated, we don't know the exact count
    return maxObjects;
}
