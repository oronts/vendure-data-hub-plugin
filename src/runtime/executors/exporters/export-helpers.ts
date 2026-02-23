/**
 * Export Helper Functions
 *
 * Shared utilities for export handlers to reduce duplication.
 */

import * as fs from 'fs';
import { FILE_STORAGE } from '../../../constants/index';
import { ensureDirectoryExists } from '../../utils';
import { getErrorMessage } from '../../../utils/error.utils';
import { ExportHandlerParams, ExportHandlerResult, resolveOutputPath } from './export-handler.types';
import { RecordObject } from '../../executor-types';

/**
 * Shared wrapper for file-based export handlers (CSV, JSON, XML).
 * Encapsulates:
 * - Path resolution
 * - Directory creation
 * - File writing
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
    const { config, records, onRecordError, stepKey, logger } = params;
    try {
        const basePath = (config.path as string) ?? FILE_STORAGE.TEMP_DIR;
        const filenamePattern = config.filenamePattern as string | undefined;
        const outputPath = resolveOutputPath(basePath, filenamePattern, defaultFilename);

        const content = formatContent(records, config);

        ensureDirectoryExists(outputPath);
        await fs.promises.writeFile(outputPath, content, 'utf-8');

        logger.info(`${formatName} export complete`, { outputPath, recordCount: records.length });
        return { ok: records.length, fail: 0 };
    } catch (e: unknown) {
        const message = getErrorMessage(e);
        if (onRecordError) await onRecordError(stepKey, message, {});
        return { ok: 0, fail: records.length };
    }
}
