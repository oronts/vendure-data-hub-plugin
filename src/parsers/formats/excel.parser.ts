/**
 * DataHub Parsers - Excel Parser
 *
 * Parses Excel files (XLSX/XLS) with support for sheet selection,
 * range specification, and header detection.
 */

import { ParseResult, ParseError, XlsxParseOptions } from '../types';
import { FileFormat } from '../../constants/enums';
import { extractFields } from '../helpers/field-extraction';


/**
 * Parse Excel content (XLSX)
 *
 * @param content - Excel file as Buffer
 * @param options - Excel parse options
 * @returns Parse result with records
 */
export async function parseExcel(
    content: Buffer,
    options: XlsxParseOptions = {},
): Promise<ParseResult> {
    const errors: ParseError[] = [];
    const warnings: string[] = [];

    try {
        // Dynamic import for xlsx library
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(content, { type: 'buffer' });

        // Get the sheet
        let sheetName: string;
        if (typeof options.sheet === 'number') {
            sheetName = workbook.SheetNames[options.sheet] ?? workbook.SheetNames[0];
        } else if (typeof options.sheet === 'string') {
            sheetName = options.sheet;
        } else {
            sheetName = workbook.SheetNames[0];
        }

        if (!sheetName) {
            return {
                success: false,
                format: FileFormat.XLSX,
                records: [],
                fields: [],
                totalRows: 0,
                errors: [{ message: 'No sheets found in workbook' }],
                warnings: [],
            };
        }

        if (!workbook.Sheets[sheetName]) {
            return {
                success: false,
                format: FileFormat.XLSX,
                records: [],
                fields: [],
                totalRows: 0,
                errors: [
                    {
                        message: `Sheet "${sheetName}" not found. Available: ${workbook.SheetNames.join(', ')}`,
                    },
                ],
                warnings: [],
            };
        }

        const sheet = workbook.Sheets[sheetName];
        const records = XLSX.utils.sheet_to_json(sheet, {
            range: options.range,
            header: options.header === false ? 1 : undefined,
            defval: null,
        }) as Record<string, unknown>[];

        const fields = extractFields(records);

        // Add info about other sheets
        if (workbook.SheetNames.length > 1) {
            warnings.push(`Workbook has ${workbook.SheetNames.length} sheets. Parsed: "${sheetName}"`);
        }

        return {
            success: true,
            format: FileFormat.XLSX,
            records,
            fields,
            totalRows: records.length,
            errors,
            warnings,
            meta: {
                sheetName,
                availableSheets: workbook.SheetNames,
            },
        };
    } catch (err) {
        // Check if xlsx is not installed
        if (err instanceof Error && err.message.includes('Cannot find module')) {
            return {
                success: false,
                format: FileFormat.XLSX,
                records: [],
                fields: [],
                totalRows: 0,
                errors: [{ message: 'Excel parsing requires xlsx package. Run: npm install xlsx' }],
                warnings: [],
            };
        }

        return {
            success: false,
            format: FileFormat.XLSX,
            records: [],
            fields: [],
            totalRows: 0,
            errors: [{ message: err instanceof Error ? err.message : 'Failed to parse Excel file' }],
            warnings: [],
        };
    }
}

/**
 * Get list of sheet names from Excel file
 *
 * @param content - Excel file as Buffer
 * @returns Array of sheet names
 */
export async function getSheetNames(content: Buffer): Promise<string[]> {
    try {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(content, { type: 'buffer' });
        return workbook.SheetNames;
    } catch {
        // Excel parsing failed (corrupt file or unsupported format) - return empty array
        // to allow graceful degradation in UI sheet selection
        return [];
    }
}

/**
 * Get sheet dimensions
 *
 * @param content - Excel file as Buffer
 * @param sheetName - Sheet name (optional, defaults to first)
 * @returns Dimensions object or null
 */
export async function getSheetDimensions(
    content: Buffer,
    sheetName?: string,
): Promise<{ rows: number; cols: number; range: string } | null> {
    try {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(content, { type: 'buffer' });
        const sheet = workbook.Sheets[sheetName ?? workbook.SheetNames[0]];

        if (!sheet || !sheet['!ref']) {
            return null;
        }

        const range = XLSX.utils.decode_range(sheet['!ref']);

        return {
            rows: range.e.r - range.s.r + 1,
            cols: range.e.c - range.s.c + 1,
            range: sheet['!ref'],
        };
    } catch {
        // Excel parsing failed (corrupt file or unsupported format) - return null
        // to indicate dimensions are unavailable for preview purposes
        return null;
    }
}

/**
 * Check if content appears to be an Excel file
 *
 * @param content - Buffer to check
 * @returns True if content appears to be Excel
 */
export function isExcelFile(content: Buffer): boolean {
    // XLSX files are ZIP archives starting with PK
    if (content.length >= 4) {
        // ZIP signature
        if (content[0] === 0x50 && content[1] === 0x4b && content[2] === 0x03 && content[3] === 0x04) {
            return true;
        }
        // Old XLS format (BIFF)
        if (content[0] === 0xd0 && content[1] === 0xcf && content[2] === 0x11 && content[3] === 0xe0) {
            return true;
        }
    }
    return false;
}

/**
 * Generate Excel file from records
 *
 * @param records - Records to convert
 * @param options - Generation options
 * @returns Excel file as Buffer
 */
export async function generateExcel(
    records: Record<string, unknown>[],
    options: { sheetName?: string } = {},
): Promise<Buffer> {
    const XLSX = await import('xlsx');

    const worksheet = XLSX.utils.json_to_sheet(records);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, options.sheetName ?? 'Sheet1');

    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

/**
 * Convert cell reference to row/column indices
 *
 * @param ref - Cell reference (e.g., "A1", "BC123")
 * @returns Object with row and column (0-indexed)
 */
export function parseCellRef(ref: string): { row: number; col: number } | null {
    const match = ref.match(/^([A-Z]+)(\d+)$/i);
    if (!match) return null;

    const colStr = match[1].toUpperCase();
    const row = parseInt(match[2], 10) - 1;

    let col = 0;
    for (let i = 0; i < colStr.length; i++) {
        col = col * 26 + (colStr.charCodeAt(i) - 64);
    }
    col -= 1;

    return { row, col };
}

/**
 * Convert row/column indices to cell reference
 *
 * @param row - Row index (0-indexed)
 * @param col - Column index (0-indexed)
 * @returns Cell reference (e.g., "A1")
 */
export function toCellRef(row: number, col: number): string {
    let colStr = '';
    let colIndex = col + 1;

    while (colIndex > 0) {
        const mod = (colIndex - 1) % 26;
        colStr = String.fromCharCode(65 + mod) + colStr;
        colIndex = Math.floor((colIndex - 1) / 26);
    }

    return `${colStr}${row + 1}`;
}

/**
 * Parse range string to start/end cells
 *
 * @param range - Range string (e.g., "A1:Z100")
 * @returns Start and end cell references
 */
export function parseRange(range: string): {
    start: { row: number; col: number };
    end: { row: number; col: number };
} | null {
    const [start, end] = range.split(':');
    if (!start || !end) return null;

    const startCell = parseCellRef(start);
    const endCell = parseCellRef(end);

    if (!startCell || !endCell) return null;

    return { start: startCell, end: endCell };
}
