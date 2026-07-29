/**
 * Export Helper Functions
 *
 * Shared utilities for export handlers to reduce duplication.
 */

import * as pathLib from 'path';
import { FILE_STORAGE, EXTENSION_MIME_MAP, CONTENT_TYPES } from '../../../constants/index';
import { resolveSafeOutputPath, writeFileSafely } from '../../../utils/safe-output-path.utils';
import { getErrorMessage } from '../../../utils/error.utils';
import { ExportHandlerParams, ExportHandlerResult, renderOutputFilename } from './export-handler.types';
import { RecordObject } from '../../executor-types';
import { parseInlineExportDestination } from '../../../services/destinations/inline-export-destination';

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
    const {
        ctx,
        config,
        records,
        onRecordError,
        stepKey,
        logger,
        fileStorageService,
        exportDestinationService,
    } = params;
    try {
        const relativeDirectory = (config.path as string) ?? '.';
        const filename = renderOutputFilename(config.filenamePattern as string | undefined, defaultFilename);

        let content = formatContent(records, config);

        // Optionally prepend UTF-8 BOM for CSV exports to improve compatibility with Excel
        if (formatName === 'CSV' && config.addBom === true) {
            content = '\uFEFF' + content;
        }

        const inlineDestination = parseInlineExportDestination(stepKey, config);
        let outputLocation: string;
        if (inlineDestination) {
            if (!exportDestinationService) {
                throw new Error('Export destination delivery service is unavailable');
            }
            const mimeType = inferMimeType(filename);
            const delivery = await exportDestinationService.deliverConfigured(
                ctx,
                inlineDestination,
                content,
                filename,
                {
                    mimeType,
                    metadata: {
                        source: 'export',
                        format: formatName,
                        stepKey,
                        recordCount: records.length,
                    },
                },
            );
            if (!delivery.success) {
                throw new Error(delivery.error ?? `Delivery to ${inlineDestination.type} failed`);
            }
            outputLocation = delivery.location ?? inlineDestination.type;
        } else {
            const outputPath = await resolveSafeOutputPath(FILE_STORAGE.EXPORT_ROOT, relativeDirectory, filename);
            await writeFileSafely(outputPath, content);
            outputLocation = outputPath;
        }

        // Register the exported file in the file storage system so it appears
        // in the /data-hub/files/ REST API for download
        if (fileStorageService) {
            const buffer = Buffer.from(content, 'utf-8');
            const fileName = pathLib.basename(filename);
            const mimeType = inferMimeType(filename);
            const result = await fileStorageService.storeFile(ctx, buffer, fileName, mimeType, {
                metadata: { source: 'export', format: formatName, stepKey, recordCount: records.length },
            });
            if (result.success) {
                logger.debug(`Export file registered in storage`, { fileId: result.file?.id, fileName });
            } else {
                logger.warn(`Failed to register export file in storage`, { error: result.error, fileName });
            }
        }

        logger.info(`${formatName} export complete`, { outputLocation, recordCount: records.length });
        return { ok: records.length, fail: 0 };
    } catch (e: unknown) {
        const message = getErrorMessage(e);
        if (onRecordError) await onRecordError(stepKey, message, { error: message, format: formatName, recordCount: records.length });
        return { ok: 0, fail: records.length };
    }
}
