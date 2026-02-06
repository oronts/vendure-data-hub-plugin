/**
 * FTP File Operations
 *
 * Utilities for FTP file filtering, parsing, and metadata handling.
 * Uses shared utilities from extractors/shared to eliminate duplication.
 */

import { FtpFileInfo, FtpExtractorConfig, FtpFileMetadata, FtpProtocol } from './types';
import { FileParserService } from '../../parsers/file-parser.service';
import { JsonObject } from '../../types/index';
import {
    parseFileContent,
    filterByModifiedAfter as sharedFilterByModifiedAfter,
    attachMetadataToRecord as sharedAttachMetadataToRecord,
} from '../shared';

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

/**
 * Filter FTP files by modification date.
 * Delegates to shared utility for consistent behavior.
 */
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

export async function parseFtpContent(
    content: Buffer,
    filename: string,
    config: FtpExtractorConfig,
    fileParser: FileParserService,
): Promise<JsonObject[]> {
    // Use shared parseFileContent to eliminate duplication
    return parseFileContent(
        content,
        filename,
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

/**
 * Attach FTP metadata to a record.
 * Uses shared utility with FTP-specific key.
 */
export function attachMetadataToRecord(
    record: JsonObject,
    metadata: FtpFileMetadata,
): JsonObject {
    return sharedAttachMetadataToRecord(record, metadata, '_ftp');
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
