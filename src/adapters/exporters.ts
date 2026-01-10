/**
 * Data Exporters
 *
 * Adapters for exporting data to various formats.
 */

import { RecordObject } from '../runtime/executor-types';
import { AdapterDefinition } from './types';
import { getFieldValue, escapeCSV } from './utils';

/**
 * CSV Exporter
 */
export const csvExporter: AdapterDefinition = {
    code: 'csv-exporter',
    name: 'CSV Exporter',
    type: 'exporter',
    description: 'Export records to CSV format',
    configSchema: {
        properties: {
            delimiter: { type: 'string', label: 'Delimiter', default: ',' },
            includeHeader: { type: 'boolean', label: 'Include Header', default: true },
            fields: { type: 'array', label: 'Fields', description: 'Fields to include (empty = all)' },
            quoteAll: { type: 'boolean', label: 'Quote All Fields', default: false },
        },
    },
    async process(_ctx, records, config) {
        if (records.length === 0) {
            return { success: true, records: [{ content: '', filename: 'export.csv' }] };
        }

        const delimiter = String(config.delimiter || ',');
        const includeHeader = config.includeHeader !== false;
        const fields = (Array.isArray(config.fields) ? config.fields as string[] : Object.keys(records[0]));
        const quoteAll = Boolean(config.quoteAll);

        const rows: string[] = [];

        if (includeHeader) {
            rows.push(fields.map(f => escapeCSV(String(f), delimiter, quoteAll)).join(delimiter));
        }

        for (const record of records) {
            const values = fields.map(f => {
                const value = getFieldValue(record, String(f));
                return escapeCSV(value, delimiter, quoteAll);
            });
            rows.push(values.join(delimiter));
        }

        return {
            success: true,
            records: [{ content: rows.join('\n'), filename: 'export.csv', mimeType: 'text/csv' }],
        };
    },
};

/**
 * JSON Exporter
 */
export const jsonExporter: AdapterDefinition = {
    code: 'json-exporter',
    name: 'JSON Exporter',
    type: 'exporter',
    description: 'Export records to JSON format',
    configSchema: {
        properties: {
            pretty: { type: 'boolean', label: 'Pretty Print', default: true },
            wrapInArray: { type: 'boolean', label: 'Wrap in Array', default: true },
            rootKey: { type: 'string', label: 'Root Key', description: 'Wrap data in object with this key' },
        },
    },
    async process(_ctx, records, config) {
        const pretty = config.pretty !== false;
        const wrapInArray = config.wrapInArray !== false;
        const rootKey = config.rootKey as string;

        let data: RecordObject | RecordObject[] = wrapInArray ? records : records[0];

        if (rootKey) {
            data = { [rootKey]: data };
        }

        const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

        return {
            success: true,
            records: [{ content, filename: 'export.json', mimeType: 'application/json' }],
        };
    },
};

/**
 * Collection of all exporters
 */
export const exporters = {
    csv: csvExporter,
    json: jsonExporter,
};
