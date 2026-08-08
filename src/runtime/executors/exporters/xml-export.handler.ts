/**
 * XML Export Handler
 *
 * Writes records to an XML file on disk.
 */

import { recordsToXml } from '../../utils';
import { ExportHandlerParams, ExportHandlerResult } from './export-handler.types';
import { writeExportFile } from './export-helpers';

export async function xmlExportHandler(params: ExportHandlerParams): Promise<ExportHandlerResult> {
    return writeExportFile(
        params,
        'export.xml',
        (records, config) => {
            const rootElement = (config.rootElement as string) ?? 'records';
            const itemElement = (config.itemElement as string) ?? 'record';
            return recordsToXml(
                records,
                rootElement,
                itemElement,
                config.declaration !== false,
            );
        },
        'XML',
    );
}
