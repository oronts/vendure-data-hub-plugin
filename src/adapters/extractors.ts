/**
 * File Extractors
 *
 * Adapters for extracting data from various file formats.
 */

import { AdapterDefinition } from './types';

/**
 * CSV Extractor
 */
export const csvExtractor: AdapterDefinition = {
    code: 'csv-extractor',
    name: 'CSV File Extractor',
    type: 'extractor',
    description: 'Parse CSV files with configurable delimiter and header options',
    configSchema: {
        properties: {
            delimiter: { type: 'string', label: 'Delimiter', default: ',', description: 'Field separator character' },
            hasHeader: { type: 'boolean', label: 'Has Header Row', default: true },
            skipEmptyLines: { type: 'boolean', label: 'Skip Empty Lines', default: true },
            encoding: { type: 'select', label: 'Encoding', default: 'utf-8', options: [
                { value: 'utf-8', label: 'UTF-8' },
                { value: 'latin1', label: 'Latin-1' },
                { value: 'utf-16', label: 'UTF-16' },
            ]},
        },
    },
    async process(_ctx, records, _config) {
        // CSV parsing is handled by FileParserService
        return { success: true, records };
    },
};

/**
 * JSON Extractor
 */
export const jsonExtractor: AdapterDefinition = {
    code: 'json-extractor',
    name: 'JSON File Extractor',
    type: 'extractor',
    description: 'Parse JSON files with support for nested data extraction',
    configSchema: {
        properties: {
            dataPath: { type: 'string', label: 'Data Path', description: 'JSON path to array of items (e.g., data.items)' },
            flattenNested: { type: 'boolean', label: 'Flatten Nested Objects', default: false },
        },
    },
    async process(_ctx, records, config) {
        let data = records;

        // Extract data from path if specified
        if (config.dataPath && typeof config.dataPath === 'string') {
            const pathParts = String(config.dataPath).split('.');
            for (const part of pathParts) {
                if (data && typeof data === 'object' && !Array.isArray(data) && part in data) {
                    data = (data as Record<string, unknown>)[part] as typeof data;
                } else {
                    return { success: false, records: [], errors: [{ message: `Path ${config.dataPath} not found` }] };
                }
            }
        }

        if (!Array.isArray(data)) {
            data = [data] as typeof records;
        }

        return { success: true, records: data };
    },
};

/**
 * XML Extractor
 */
export const xmlExtractor: AdapterDefinition = {
    code: 'xml-extractor',
    name: 'XML File Extractor',
    type: 'extractor',
    description: 'Parse XML files with configurable element selection',
    configSchema: {
        properties: {
            itemElement: { type: 'string', label: 'Item Element', default: 'item', description: 'XML element name for each item' },
            attributePrefix: { type: 'string', label: 'Attribute Prefix', default: '@_' },
            textNodeName: { type: 'string', label: 'Text Node Name', default: '#text' },
        },
    },
    async process(_ctx, records, _config) {
        // XML parsing is handled by FileParserService
        return { success: true, records };
    },
};

/**
 * Collection of all file extractors
 */
export const extractors = {
    csv: csvExtractor,
    json: jsonExtractor,
    xml: xmlExtractor,
};
