import * as path from 'path';
import { FileFormat, FORMAT_EXTENSIONS } from '../../parsers/types';
import { FILE_FORMAT_METADATA } from '../../constants/adapter-schema-options';
import { FileParserService } from '../../parsers/file-parser.service';
import { JsonObject } from '../../types/index';

/**
 * Extension-to-format mapping — auto-derived from FILE_FORMAT_METADATA.
 * Only includes parseable formats (CSV, JSON, XML, XLSX).
 */
export const FILE_FORMAT_MAP: Record<string, FileFormat> = (() => {
    const map: Record<string, string> = {};
    for (const [format, meta] of Object.entries(FILE_FORMAT_METADATA)) {
        if (!meta.parseable) continue;
        for (const ext of meta.extensions) {
            map[ext] = format;
        }
    }
    return map as Record<string, FileFormat>;
})();

/**
 * Extract the file extension from a filename, path, or URL.
 * Handles URLs with query params/fragments, dotfiles, and missing extensions.
 * Returns lowercase extension without the leading dot, or empty string if none.
 */
export function extractFileExtension(filenameOrUrl: string): string {
    let pathname = filenameOrUrl;
    try {
        // If it looks like a URL, parse out the pathname to strip query/fragment
        if (filenameOrUrl.includes('://')) {
            pathname = new URL(filenameOrUrl).pathname;
        }
    } catch {
        // Not a valid URL -- fall through to path-based extraction
    }
    const ext = path.extname(pathname);
    // path.extname returns '' for no extension, '.ext' otherwise
    return ext ? ext.slice(1).toLowerCase() : '';
}

export function detectFileFormat(filenameOrPath: string): FileFormat | undefined {
    const extension = extractFileExtension(filenameOrPath);
    return FILE_FORMAT_MAP[extension || ''];
}

export function getFileExtension(filePath: string): string {
    return extractFileExtension(filePath);
}

export function hasExpectedExtension(filename: string, format?: FileFormat): boolean {
    if (!format) return true;

    const extension = getFileExtension(filename);
    const validExtensions = FORMAT_EXTENSIONS[format] || [];
    return validExtensions.length === 0 || validExtensions.includes(extension);
}

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

export function parseModifiedAfterDate(dateStr: string): Date | null {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

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

export interface BaseFileMetadata {
    size: number;
    lastModified: string;
}

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
