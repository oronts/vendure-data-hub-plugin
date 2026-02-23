/**
 * Export Handler Types
 *
 * Common types for export handler functions used by the ExportExecutor.
 */

import * as pathLib from 'path';
import { RequestContext } from '@vendure/core';
import { JsonValue } from '../../../types/index';
import { SecretService } from '../../../services/config/secret.service';
import { DataHubLogger } from '../../../services/logger';
import { OnRecordErrorCallback, RecordObject } from '../../executor-types';
import { formatDate } from '../../../transforms/field/date-transforms';
import { securePath } from '../../../utils/input-validation.utils';

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

/**
 * Resolve output file path from directory path and filename pattern.
 * Shared utility used by file-based export handlers (CSV, JSON, XML).
 */
export function resolveOutputPath(basePath: string, filenamePattern?: string, defaultFilename?: string): string {
    const ext = pathLib.extname(basePath);
    if (ext && ext.length > 1 && ext.length < 6) {
        return basePath;
    }

    let filename = filenamePattern || defaultFilename || 'export.csv';

    const now = new Date();
    filename = filename
        .replace(/\$\{date:([^}]+)\}/g, (_match, format: string) => {
            return formatDate(now, format);
        })
        .replace(/\$\{timestamp\}/g, String(Date.now()))
        .replace(/\$\{uuid\}/g, crypto.randomUUID());

    return securePath(basePath, filename);
}
