/**
 * JSON Export Handler
 *
 * Writes records to a JSON or NDJSON file on disk.
 */

import { FileFormat } from '../../../constants/enums';
import { ExportHandlerParams, ExportHandlerResult } from './export-handler.types';
import { writeExportFile } from './export-helpers';

export async function jsonExportHandler(params: ExportHandlerParams): Promise<ExportHandlerResult> {
    return writeExportFile(
        params,
        'export.json',
        (records, config) => {
            const format = (config.format as string) ?? 'json';
            if (format === FileFormat.NDJSON || format === 'jsonl') {
                return records.map(r => JSON.stringify(r)).join('\n');
            } else {
                const pretty = config.pretty !== false;
                return JSON.stringify(records, null, pretty ? 2 : undefined);
            }
        },
        'JSON',
    );
}
