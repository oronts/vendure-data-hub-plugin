/**
 * XML Export Handler
 *
 * Writes records to an XML file on disk.
 */

import { xmlEscape } from '../../utils';
import { ExportHandlerParams, ExportHandlerResult } from './export-handler.types';
import { writeExportFile } from './export-helpers';

export async function xmlExportHandler(params: ExportHandlerParams): Promise<ExportHandlerResult> {
    return writeExportFile(
        params,
        'export.xml',
        (records, config) => {
            const rootElement = (config.rootElement as string) ?? 'records';
            const itemElement = (config.itemElement as string) ?? 'record';
            const declaration = config.declaration !== false;
            let xml = declaration ? '<?xml version="1.0" encoding="UTF-8"?>\n' : '';
            xml += `<${rootElement}>\n`;
            for (const rec of records) {
                xml += `  <${itemElement}>\n`;
                for (const [k, v] of Object.entries(rec)) {
                    const escaped = xmlEscape(String(v ?? ''));
                    xml += `    <${k}>${escaped}</${k}>\n`;
                }
                xml += `  </${itemElement}>\n`;
            }
            xml += `</${rootElement}>`;
            return xml;
        },
        'XML',
    );
}
