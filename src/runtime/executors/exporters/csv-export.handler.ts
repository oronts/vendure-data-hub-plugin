/**
 * CSV Export Handler
 *
 * Writes records to a CSV file on disk.
 */

import { CsvFormulaMode, recordsToCsv } from '../../utils';
import { ExportHandlerParams, ExportHandlerResult } from './export-handler.types';
import { writeExportFile } from './export-helpers';

export async function csvExportHandler(params: ExportHandlerParams): Promise<ExportHandlerResult> {
    return writeExportFile(
        params,
        'export.csv',
        (records, config) => {
            const delimiter = (config.delimiter as string) ?? ',';
            const includeHeader = config.includeHeader !== false;
            const formulaMode = (config.formulaMode as CsvFormulaMode | undefined) ?? 'SPREADSHEET_SAFE';
            return recordsToCsv(records, delimiter, includeHeader, formulaMode);
        },
        'CSV',
    );
}
