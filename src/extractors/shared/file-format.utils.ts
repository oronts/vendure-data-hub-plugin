import { FileFormat } from '../../parsers/types';
import { FileParserService } from '../../parsers/file-parser.service';
import { JsonObject } from '../../types/index';

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

export function detectFileFormat(filenameOrPath: string): FileFormat | undefined {
    const extension = filenameOrPath.split('.').pop()?.toLowerCase();
    return FILE_FORMAT_MAP[extension || ''];
}

export function getFileExtension(path: string): string {
    const parts = path.split('.');
    return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
}

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
