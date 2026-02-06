/**
 * Shared File Format Utilities
 *
 * Unified file format detection, content parsing options, and metadata handling
 * for FTP and S3 extractors.
 *
 * Previously duplicated in:
 * - src/extractors/ftp/file-operations.ts
 * - src/extractors/s3/file-handlers.ts
 *
 * @module extractors/shared
 */

import { FileFormat } from '../../parsers/types';
import { FileParserService } from '../../parsers/file-parser.service';
import { JsonObject } from '../../types/index';

/**
 * File format extension mapping - single source of truth
 */
export const FILE_FORMAT_MAP: Record<string, FileFormat> = {
    csv: 'csv',
    tsv: 'csv',
    json: 'json',
    jsonl: 'json',
    ndjson: 'json',
    xml: 'xml',
    xlsx: 'xlsx',
    xls: 'xlsx',
};

/**
 * Detect file format from filename or path
 * @param filenameOrPath - Filename or full path to extract extension from
 * @returns Detected file format or undefined
 */
export function detectFileFormat(filenameOrPath: string): FileFormat | undefined {
    const extension = filenameOrPath.split('.').pop()?.toLowerCase();
    return FILE_FORMAT_MAP[extension || ''];
}

/**
 * Get file extension from path
 * @param path - Full path or filename
 * @returns Lowercase extension without dot
 */
export function getFileExtension(path: string): string {
    const parts = path.split('.');
    return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
}

/**
 * Check if file has expected extension for format
 * @param filename - Filename to check
 * @param format - Expected file format
 * @returns True if extension matches format
 */
export function hasExpectedExtension(filename: string, format?: FileFormat): boolean {
    if (!format) return true;

    const extension = getFileExtension(filename);
    const formatExtensions: Record<string, string[]> = {
        csv: ['csv', 'tsv'],
        json: ['json', 'jsonl', 'ndjson'],
        xml: ['xml'],
        xlsx: ['xlsx', 'xls'],
    };

    const validExtensions = formatExtensions[format] || [];
    return validExtensions.length === 0 || validExtensions.includes(extension);
}

/**
 * Shared parse options for file content parsing
 */
export interface FileParseOptions {
    format?: FileFormat;
    csv?: {
        delimiter?: ',' | ';' | '\t' | '|';
        header?: boolean;
        skipEmptyLines?: boolean;
    };
    json?: {
        path?: string;
    };
    xml?: {
        recordPath?: string;
        attributePrefix?: string;
    };
    xlsx?: {
        sheet?: string | number;
        range?: string;
        header?: boolean;
    };
}

/**
 * Parse file content using the file parser service
 * @param content - Raw file content buffer
 * @param filenameOrKey - Filename or S3 key for format detection
 * @param options - Parse options with format overrides
 * @param fileParser - File parser service instance
 * @returns Array of parsed records
 */
export async function parseFileContent(
    content: Buffer,
    filenameOrKey: string,
    options: FileParseOptions,
    fileParser: FileParserService,
): Promise<JsonObject[]> {
    const format = options.format || detectFileFormat(filenameOrKey);

    const parseOptions: FileParseOptions = {
        format,
        csv: options.csv,
        json: options.json,
        xml: options.xml,
        xlsx: options.xlsx,
    };

    const result = await fileParser.parse(content, parseOptions);
    return result.records as JsonObject[];
}

/**
 * Parse ISO date string safely
 * @param dateStr - ISO date string to parse
 * @returns Parsed Date or null if invalid
 */
export function parseModifiedAfterDate(dateStr: string): Date | null {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Filter items by modification date
 * @param items - Items with lastModified/modifiedAt property
 * @param modifiedAfter - ISO date string filter
 * @param dateKey - Property key for date ('lastModified' or 'modifiedAt')
 * @returns Filtered items
 */
export function filterByModifiedAfter<T extends Record<string, unknown>>(
    items: T[],
    modifiedAfter: string | undefined,
    dateKey: 'lastModified' | 'modifiedAt',
): T[] {
    if (!modifiedAfter) return items;

    const afterDate = new Date(modifiedAfter);
    if (isNaN(afterDate.getTime())) return items;

    return items.filter(item => {
        const itemDate = item[dateKey];
        if (itemDate instanceof Date) {
            return itemDate >= afterDate;
        }
        return true;
    });
}

/**
 * Base metadata interface for file sources
 */
export interface BaseFileMetadata {
    size: number;
    lastModified: string;
}

/**
 * Attach metadata to a record with a specified key
 * @param record - Record to attach metadata to
 * @param metadata - Metadata object (any object type)
 * @param key - Metadata key (e.g., '_ftp', '_s3')
 * @returns Record with attached metadata
 */
export function attachMetadataToRecord<T extends object>(
    record: JsonObject,
    metadata: T,
    key: string,
): JsonObject {
    return {
        ...record,
        [key]: metadata as unknown as JsonObject,
    };
}
