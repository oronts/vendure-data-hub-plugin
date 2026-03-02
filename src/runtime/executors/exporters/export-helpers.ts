/**
 * Export Helper Functions
 *
 * Shared utilities for export handlers to reduce duplication.
 */

import * as fs from 'fs';
import * as pathLib from 'path';
import { FILE_STORAGE, EXTENSION_MIME_MAP, CONTENT_TYPES } from '../../../constants/index';
import { ensureDirectoryExists } from '../../utils';
import { getErrorMessage } from '../../../utils/error.utils';
import { ExportHandlerParams, ExportHandlerResult, resolveOutputPath } from './export-handler.types';
import { RecordObject } from '../../executor-types';

/**
 * Infer MIME type from file extension for export registration.
 */
function inferMimeType(filePath: string): string {
    const ext = pathLib.extname(filePath).toLowerCase();
    return EXTENSION_MIME_MAP[ext] ?? CONTENT_TYPES.OCTET_STREAM;
}

/**
 * Shared wrapper for file-based export handlers (CSV, JSON, XML).
 * Encapsulates:
 * - Path resolution
 * - Directory creation
 * - File writing
 * - File registration in the REST API (via FileStorageService)
 * - Error handling with onRecordError
 * - Success logging
 *
 * @param params - Export handler parameters
 * @param defaultFilename - Default filename if no pattern provided (e.g., 'export.csv')
 * @param formatContent - Function that converts records to file content string
 * @param formatName - Human-readable format name for logging (e.g., 'CSV', 'JSON', 'XML')
 */
export async function writeExportFile(
    params: ExportHandlerParams,
    defaultFilename: string,
    formatContent: (records: RecordObject[], config: Record<string, unknown>) => string,
    formatName: string,
): Promise<ExportHandlerResult> {
    const { ctx, config, records, onRecordError, stepKey, logger, fileStorageService } = params;
    try {
        const basePath = (config.path as string) ?? FILE_STORAGE.TEMP_DIR;
        const filenamePattern = (config.filenamePattern ?? config.filename) as string | undefined;
        const outputPath = resolveOutputPath(basePath, filenamePattern, defaultFilename);

        let content = formatContent(records, config);

        // Optionally prepend UTF-8 BOM for CSV exports to improve compatibility with Excel
        if (formatName === 'CSV' && config.addBom === true) {
            content = '\uFEFF' + content;
        }

        ensureDirectoryExists(outputPath);
        await fs.promises.writeFile(outputPath, content, 'utf-8');

        // Register the exported file in the file storage system so it appears
        // in the /data-hub/files/ REST API for download
        if (fileStorageService) {
            const buffer = Buffer.from(content, 'utf-8');
            const fileName = pathLib.basename(outputPath);
            const mimeType = inferMimeType(outputPath);
            const result = await fileStorageService.storeFile(ctx, buffer, fileName, mimeType, {
                metadata: { source: 'export', format: formatName, stepKey, recordCount: records.length },
            });
            if (result.success) {
                logger.debug(`Export file registered in storage`, { fileId: result.file?.id, fileName });
            } else {
                logger.warn(`Failed to register export file in storage`, { error: result.error, fileName });
            }
        }

        logger.info(`${formatName} export complete`, { outputPath, recordCount: records.length });
        return { ok: records.length, fail: 0 };
    } catch (e: unknown) {
        const message = getErrorMessage(e);
        if (onRecordError) await onRecordError(stepKey, message, { error: message, format: formatName, recordCount: records.length });
        return { ok: 0, fail: records.length };
    }
}
