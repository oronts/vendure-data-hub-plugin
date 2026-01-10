/**
 * Data Transformers
 *
 * Adapters for transforming data records.
 */

import { RecordObject } from '../runtime/executor-types';
import { JsonValue } from '../types/index';
import { AdapterDefinition } from './types';
import { FilterCondition, getFieldValue, setFieldValue, evaluateCondition } from './utils';

/**
 * Field Mapper Transformer
 */
export const fieldMapperTransformer: AdapterDefinition = {
    code: 'field-mapper',
    name: 'Field Mapper',
    type: 'transformer',
    description: 'Map fields from source to target with optional transformations',
    configSchema: {
        properties: {
            mappings: { type: 'object', label: 'Field Mappings', description: 'Source to target field mappings' },
            removeUnmapped: { type: 'boolean', label: 'Remove Unmapped Fields', default: false },
        },
        required: ['mappings'],
    },
    async process(_ctx, records, config) {
        const mappings = config.mappings as Record<string, string>;
        const removeUnmapped = config.removeUnmapped || false;

        const results = records.map(record => {
            const result: RecordObject = removeUnmapped ? {} : { ...record };

            for (const [source, target] of Object.entries(mappings)) {
                const value = getFieldValue(record, source);
                if (value !== undefined) {
                    setFieldValue(result, target, value);
                }
            }

            return result;
        });

        return { success: true, records: results };
    },
};

/**
 * Data Filter Transformer
 */
export const filterTransformer: AdapterDefinition = {
    code: 'filter',
    name: 'Data Filter',
    type: 'transformer',
    description: 'Filter records based on conditions',
    configSchema: {
        properties: {
            conditions: { type: 'array', label: 'Filter Conditions' },
            mode: { type: 'select', label: 'Mode', default: 'include', options: [
                { value: 'include', label: 'Include Matching' },
                { value: 'exclude', label: 'Exclude Matching' },
            ]},
            logic: { type: 'select', label: 'Logic', default: 'all', options: [
                { value: 'all', label: 'All Conditions (AND)' },
                { value: 'any', label: 'Any Condition (OR)' },
            ]},
        },
    },
    async process(_ctx, records, config) {
        const rawConditions = Array.isArray(config.conditions) ? config.conditions : [];
        const conditions = rawConditions as unknown as FilterCondition[];
        const mode = (config.mode || 'include') as 'include' | 'exclude';
        const logic = (config.logic || 'all') as 'all' | 'any';

        if (conditions.length === 0) {
            return { success: true, records };
        }

        const results = records.filter(record => {
            const matches = conditions.map(cond => evaluateCondition(record, cond));
            const passes = logic === 'all' ? matches.every(m => m) : matches.some(m => m);
            return mode === 'include' ? passes : !passes;
        });

        return {
            success: true,
            records: results,
            stats: {
                processed: records.length,
                skipped: records.length - results.length,
            },
        };
    },
};

/**
 * Deduplicator Transformer
 */
export const deduplicatorTransformer: AdapterDefinition = {
    code: 'deduplicator',
    name: 'Deduplicator',
    type: 'transformer',
    description: 'Remove duplicate records based on key fields',
    configSchema: {
        properties: {
            keyFields: { type: 'array', label: 'Key Fields', description: 'Fields to use for duplicate detection' },
            keepFirst: { type: 'boolean', label: 'Keep First', default: true, description: 'Keep first occurrence (vs last)' },
        },
        required: ['keyFields'],
    },
    async process(_ctx, records, config) {
        const keyFields = config.keyFields as string[];
        const keepFirst = config.keepFirst !== false;

        const seen = new Map<string, RecordObject>();
        const results: RecordObject[] = [];

        const recordList = keepFirst ? records : [...records].reverse();

        for (const record of recordList) {
            const keyValues = keyFields.map(f => String(getFieldValue(record, f) ?? '')).join('|');

            if (!seen.has(keyValues)) {
                seen.set(keyValues, record);
                results.push(record);
            }
        }

        return {
            success: true,
            records: keepFirst ? results : results.reverse(),
            stats: {
                processed: records.length,
                skipped: records.length - results.length,
            },
        };
    },
};

/**
 * Enricher Transformer
 */
export const enricherTransformer: AdapterDefinition = {
    code: 'enricher',
    name: 'Data Enricher',
    type: 'transformer',
    description: 'Add computed fields and default values',
    configSchema: {
        properties: {
            defaults: { type: 'object', label: 'Default Values' },
            computed: { type: 'object', label: 'Computed Fields', description: 'Field templates with {{field}} placeholders' },
            timestamp: { type: 'string', label: 'Timestamp Field', description: 'Add current timestamp to this field' },
        },
    },
    async process(_ctx, records, config) {
        const defaults = config.defaults as Record<string, JsonValue> || {};
        const computed = config.computed as Record<string, string> || {};
        const timestampField = config.timestamp as string;

        const results = records.map(record => {
            const result = { ...defaults, ...record };

            // Apply computed fields
            for (const [target, template] of Object.entries(computed)) {
                const value = template.replace(/\{\{(\w+)\}\}/g, (_, field) => {
                    return String(getFieldValue(result, field) ?? '');
                });
                setFieldValue(result, target, value);
            }

            // Add timestamp
            if (timestampField) {
                setFieldValue(result, timestampField, new Date().toISOString());
            }

            return result;
        });

        return { success: true, records: results };
    },
};

/**
 * Collection of all transformers
 */
export const transformers = {
    fieldMapper: fieldMapperTransformer,
    filter: filterTransformer,
    deduplicator: deduplicatorTransformer,
    enricher: enricherTransformer,
};
