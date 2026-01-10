import { FtpFileInfo, FtpExtractorConfig, FtpFileMetadata, FtpProtocol } from './types';
import { FileParserService } from '../../parsers/file-parser.service';
import { FileFormat } from '../../parsers/types';
import { JsonObject } from '../../types/index';

export function matchesPattern(filename: string, pattern: string): boolean {
    const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
        .replace(/\*/g, '.*') // * matches any characters
        .replace(/\?/g, '.'); // ? matches single character

    return new RegExp(`^${regexPattern}$`, 'i').test(filename);
}

export function filterByPattern(files: FtpFileInfo[], pattern?: string): FtpFileInfo[] {
    if (!pattern) return files;
    return files.filter(file => matchesPattern(file.name, pattern));
}

export function filterByModifiedAfter(
    files: FtpFileInfo[],
    modifiedAfter?: string,
): FtpFileInfo[] {
    if (!modifiedAfter) return files;

    const afterDate = new Date(modifiedAfter);
    if (isNaN(afterDate.getTime())) return files;

    return files.filter(file => file.modifiedAt >= afterDate);
}

export function filterFiles(
    files: FtpFileInfo[],
    config: FtpExtractorConfig,
    checkpoint?: { lastProcessedFile?: string; lastModifiedAt?: string },
): FtpFileInfo[] {
    let filtered = files;

    filtered = filtered.filter(f => !f.isDirectory);
    filtered = filterByPattern(filtered, config.filePattern);
    filtered = filterByModifiedAfter(filtered, config.modifiedAfter);

    if (checkpoint?.lastModifiedAt) {
        const lastDate = new Date(checkpoint.lastModifiedAt);
        if (!isNaN(lastDate.getTime())) {
            filtered = filtered.filter(f => f.modifiedAt > lastDate);
        }
    }

    filtered.sort((a, b) => a.modifiedAt.getTime() - b.modifiedAt.getTime());

    return filtered;
}

export function detectFileFormat(filename: string): FileFormat | undefined {
    const extension = filename.split('.').pop()?.toLowerCase();

    const formatMap: Record<string, FileFormat> = {
        csv: 'csv',
        tsv: 'csv',
        json: 'json',
        jsonl: 'json',
        ndjson: 'json',
        xml: 'xml',
        xlsx: 'xlsx',
        xls: 'xlsx',
    };

    return formatMap[extension || ''];
}

export interface ParseFileOptions {
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

export async function parseFtpContent(
    content: Buffer,
    filename: string,
    config: FtpExtractorConfig,
    fileParser: FileParserService,
): Promise<JsonObject[]> {
    const format = config.format || detectFileFormat(filename);

    const parseOptions: ParseFileOptions = {
        format,
        csv: config.csv,
        json: config.json,
        xml: config.xml,
        xlsx: config.xlsx,
    };

    const result = await fileParser.parse(content, parseOptions);
    return result.records as JsonObject[];
}

export function buildFileMetadata(
    protocol: FtpProtocol,
    host: string,
    file: FtpFileInfo,
): FtpFileMetadata {
    return {
        protocol,
        host,
        path: file.path,
        size: file.size,
        modifiedAt: file.modifiedAt.toISOString(),
    };
}

export function attachMetadataToRecord(
    record: JsonObject,
    metadata: FtpFileMetadata,
): JsonObject {
    return {
        ...record,
        _ftp: metadata as unknown as JsonObject,
    };
}

export function calculateDestinationPath(
    sourcePath: string,
    destinationDir: string,
): string {
    const filename = sourcePath.split('/').pop() || sourcePath;
    const normalizedDestDir = destinationDir.endsWith('/')
        ? destinationDir
        : destinationDir + '/';
    return normalizedDestDir + filename;
}

export function parseModifiedAfterDate(dateStr: string): Date | null {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

export function isValidRemotePath(path: string): boolean {
    return path.startsWith('/') || path === '.';
}

export function isValidHost(host: string): boolean {
    if (!host || host.length === 0) return false;
    return /^[a-zA-Z0-9]([a-zA-Z0-9\-.]*[a-zA-Z0-9])?$/.test(host) ||
           /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
           /^\[[\da-fA-F:]+\]$/.test(host);
}

export function isValidPort(port: number): boolean {
    return port > 0 && port <= 65535;
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
