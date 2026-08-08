/**
 * Export Handler Types
 *
 * Common types for export handler functions used by the ExportExecutor.
 */

import { RequestContext } from '@vendure/core';
import { JsonValue } from '../../../types/index';
import { SecretService } from '../../../services/config/secret.service';
import { DataHubLogger } from '../../../services/logger';
import type { FileStorageService } from '../../../services/storage/file-storage.service';
import type { ExportDestinationService } from '../../../services/destinations/export-destination.service';
import { OnRecordErrorCallback, RecordObject } from '../../executor-types';
import { formatDate } from '../../../utils/date-format.utils';

/**
 * Parameters passed to each export handler function
 */
export interface ExportHandlerParams {
    ctx: RequestContext;
    stepKey: string;
    config: Record<string, JsonValue>;
    records: RecordObject[];
    onRecordError?: OnRecordErrorCallback;
    secretService: SecretService;
    logger: DataHubLogger;
    /** Optional file storage service for registering exported files in the REST API */
    fileStorageService?: FileStorageService;
    /** Destination delivery boundary for inline pipeline destinations. */
    exportDestinationService?: ExportDestinationService;
}

/**
 * Result returned by each export handler function
 */
export interface ExportHandlerResult {
    ok: number;
    fail: number;
}

/**
 * Function signature for built-in export handlers
 */
export type ExportHandlerFn = (params: ExportHandlerParams) => Promise<ExportHandlerResult>;

/** Render the relative filename used by file-based export handlers. */
export function renderOutputFilename(filenamePattern?: string, defaultFilename?: string): string {
    const filename = filenamePattern || defaultFilename || 'export.csv';
    const now = new Date();
    return filename
        .replace(/\$\{date:([^}]+)\}/g, (_match, format: string) => formatDate(now, format))
        .replace(/\$\{timestamp\}/g, String(Date.now()))
        .replace(/\$\{uuid\}/g, crypto.randomUUID());
}
