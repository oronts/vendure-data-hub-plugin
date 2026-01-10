/**
 * DataHub File Parser Service
 *
 * Unified service for parsing various file formats (CSV, JSON, XML, Excel).
 * Delegates to format-specific parsers for actual parsing logic.
 */

import { Injectable } from '@nestjs/common';
import {
    FileFormat,
    ParseOptions,
    ParseResult,
    FilePreview,
    FieldInfo,
    FieldType,
    FORMAT_EXTENSIONS,
} from './types';
import { TRUNCATION, PAGINATION } from '../constants/index';

export { FileFormat, ParseOptions, ParseResult, FilePreview, FieldInfo, FieldType } from './types';
import { parseCsv } from './formats/csv.parser';
import { parseJson, isJsonLines, parseJsonLines } from './formats/json.parser';
import { parseXml } from './formats/xml.parser';
import { parseExcel, isExcelFile } from './formats/excel.parser';

@Injectable()
export class FileParserService {
    /**
     * Detect file format from content or filename
     *
     * @param content - File content as string or Buffer
     * @param filename - Optional filename for extension detection
     * @returns Detected file format
     */
    detectFormat(content: string | Buffer, filename?: string): FileFormat {
        // Try filename extension first
        if (filename) {
            const ext = filename.split('.').pop()?.toLowerCase();
            if (ext) {
                for (const [format, extensions] of Object.entries(FORMAT_EXTENSIONS)) {
                    if (extensions.includes(ext)) {
                        return format as FileFormat;
                    }
                }
            }
        }

        if (Buffer.isBuffer(content)) {
            if (isExcelFile(content)) {
                return 'xlsx';
            }
            content = content.toString('utf-8', 0, 1000);
        }

        const trimmed = content.trim();

        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            return 'json';
        }

        if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
            return 'xml';
        }

        return 'csv';
    }

    /**
     * Parse file content
     *
     * @param content - File content as string or Buffer
     * @param options - Parse options
     * @returns Parse result with records
     */
    async parse(content: string | Buffer, options: ParseOptions = {}): Promise<ParseResult> {
        const format = options.format ?? this.detectFormat(content);

        switch (format) {
            case 'csv':
                return parseCsv(
                    typeof content === 'string' ? content : content.toString(options.csv?.encoding ?? 'utf-8'),
                    options.csv,
                );

            case 'json': {
                const jsonContent = typeof content === 'string' ? content : content.toString('utf-8');
                if (isJsonLines(jsonContent)) {
                    return parseJsonLines(jsonContent);
                }
                return parseJson(jsonContent, options.json);
            }

            case 'xml':
                return parseXml(
                    typeof content === 'string' ? content : content.toString('utf-8'),
                    options.xml,
                );

            case 'xlsx':
                return parseExcel(
                    Buffer.isBuffer(content) ? content : Buffer.from(content),
                    options.xlsx,
                );

            default:
                return {
                    success: false,
                    format,
                    records: [],
                    fields: [],
                    totalRows: 0,
                    errors: [{ message: `Unsupported format: ${format}` }],
                    warnings: [],
                };
        }
    }

    /**
     * Get preview of file content (first N rows with field analysis)
     *
     * @param content - File content
     * @param options - Parse options
     * @param maxRows - Maximum rows for preview (default: 10)
     * @returns File preview with field info and sample data
     */
    async preview(
        content: string | Buffer,
        options: ParseOptions = {},
        maxRows: number = PAGINATION.FILE_PREVIEW_ROWS,
    ): Promise<FilePreview> {
        const parseResult = await this.parse(content, {
            ...options,
            csv: { ...options.csv, preview: maxRows },
        });

        const sampleData = parseResult.records.slice(0, maxRows);
        const fields = this.analyzeFields(parseResult.records, parseResult.fields);

        return {
            format: parseResult.format,
            fields,
            sampleData,
            totalRows: parseResult.totalRows,
            warnings: parseResult.warnings,
        };
    }

    /**
     * Analyze field types and statistics
     *
     * @param records - Parsed records
     * @param fieldNames - Field names
     * @returns Field information array
     */
    private analyzeFields(records: Record<string, unknown>[], fieldNames: string[]): FieldInfo[] {
        const fieldStats = new Map<
            string,
            {
                types: Set<string>;
                samples: unknown[];
                nullCount: number;
                uniqueValues: Set<unknown>;
            }
        >();

        for (const field of fieldNames) {
            fieldStats.set(field, {
                types: new Set(),
                samples: [],
                nullCount: 0,
                uniqueValues: new Set(),
            });
        }

        for (const record of records) {
            for (const field of fieldNames) {
                const stats = fieldStats.get(field)!;
                const value = record[field];

                if (value === null || value === undefined || value === '') {
                    stats.nullCount++;
                } else {
                    const type = this.detectValueType(value);
                    stats.types.add(type);

                    if (stats.samples.length < TRUNCATION.SAMPLE_VALUES_LIMIT) {
                        stats.samples.push(value);
                    }

                    if (stats.uniqueValues.size < TRUNCATION.MAX_UNIQUE_VALUES) {
                        stats.uniqueValues.add(value);
                    }
                }
            }
        }

        return fieldNames.map(field => {
            const stats = fieldStats.get(field)!;
            const types = Array.from(stats.types);

            let type: FieldType = 'string';
            if (types.length === 0) {
                type = 'null';
            } else if (types.length === 1) {
                type = types[0] as FieldType;
            } else {
                type = 'mixed';
            }

            return {
                key: field,
                label: this.humanizeFieldName(field),
                type,
                sampleValues: stats.samples,
                nullCount: stats.nullCount,
                uniqueCount: stats.uniqueValues.size,
            };
        });
    }

    /**
     * Detect the type of a value
     *
     * @param value - Value to analyze
     * @returns Detected type
     */
    private detectValueType(value: unknown): FieldType {
        if (value === null || value === undefined) return 'null';
        if (Array.isArray(value)) return 'array';
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number') return 'number';
        if (typeof value === 'object') return 'object';

        if (typeof value === 'string') {
            if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
                const date = new Date(value);
                if (!isNaN(date.getTime())) return 'date';
            }
            if (value !== '' && !isNaN(Number(value))) {
                return 'number';
            }
        }

        return 'string';
    }

    /**
     * Convert field name to human-readable label
     *
     * @param name - Field name
     * @returns Human-readable label
     */
    private humanizeFieldName(name: string): string {
        return name
            .replace(/_/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/^./, s => s.toUpperCase());
    }
}
