/**
 * Transform/Operator Builders
 */

import { JsonValue } from '../../types/index';
import { OperatorConfig, RouteConditionConfig } from './step-configs';

// OPERATOR BUILDERS

export const operators = {
    /** Map fields from source paths to destination fields */
    map(mapping: Record<string, string>): OperatorConfig {
        return { op: 'map', args: { mapping } };
    },

    /** Set a static value at a path */
    set(path: string, value: JsonValue): OperatorConfig {
        return { op: 'set', args: { path, value } };
    },

    /** Set default values for missing fields */
    defaults(fields: Record<string, JsonValue>): OperatorConfig {
        return { op: 'enrich', args: { defaults: fields } };
    },

    /** Remove a field at path */
    remove(path: string): OperatorConfig {
        return { op: 'remove', args: { path } };
    },

    /** Rename a field */
    rename(from: string, to: string): OperatorConfig {
        return { op: 'rename', args: { from, to } };
    },

    /** Filter records by conditions */
    when(conditions: RouteConditionConfig[], action: 'keep' | 'drop' = 'keep'): OperatorConfig {
        return { op: 'when', args: { conditions, action } };
    },

    /** Render a string template */
    template(template: string, target: string, missingAsEmpty = false): OperatorConfig {
        return { op: 'template', args: { template, target, missingAsEmpty } };
    },

    /** Lookup value from a map */
    lookup(source: string, map: Record<string, JsonValue>, target: string, defaultValue?: JsonValue): OperatorConfig {
        return { op: 'lookup', args: { source, map, target, default: defaultValue } };
    },

    /** Convert currency to minor units */
    currency(source: string, target: string, decimals = 2, round: 'round' | 'floor' | 'ceil' = 'round'): OperatorConfig {
        return { op: 'currency', args: { source, target, decimals, round } };
    },

    /** Convert units (e.g., g to kg) */
    unit(source: string, target: string, from: string, to: string): OperatorConfig {
        return { op: 'unit', args: { source, target, from, to } };
    },

    /** Filter out unchanged records using delta detection */
    deltaFilter(idPath: string, includePaths?: string[], excludePaths?: string[]): OperatorConfig {
        return { op: 'deltaFilter', args: { idPath, includePaths, excludePaths } };
    },

    /** Compute an aggregate over records */
    aggregate(op: 'count' | 'sum' | 'avg' | 'min' | 'max', source: string, target: string): OperatorConfig {
        return { op: 'aggregate', args: { op, source, target } };
    },

    /** Flatten nested arrays */
    flatten(sourcePath: string, targetPath?: string): OperatorConfig {
        return { op: 'flatten', args: { source: sourcePath, target: targetPath } };
    },

    /** Split a string into an array */
    split(source: string, target: string, delimiter = ','): OperatorConfig {
        return { op: 'split', args: { source, target, delimiter } };
    },

    /** Join an array into a string */
    join(source: string, target: string, delimiter = ','): OperatorConfig {
        return { op: 'join', args: { source, target, delimiter } };
    },

    /** Coalesce - return first non-null value from paths */
    coalesce(paths: string[], target: string): OperatorConfig {
        return { op: 'coalesce', args: { paths, target } };
    },

    /** Format a date */
    dateFormat(source: string, target: string, format: string, inputFormat?: string): OperatorConfig {
        return { op: 'dateFormat', args: { source, target, format, inputFormat } };
    },

    /** Parse JSON string to object */
    parseJson(source: string, target?: string): OperatorConfig {
        return { op: 'parseJson', args: { source, target } };
    },

    /** Stringify object to JSON */
    stringifyJson(source: string, target?: string): OperatorConfig {
        return { op: 'stringifyJson', args: { source, target } };
    },

    /** Trim whitespace from string */
    trim(path: string): OperatorConfig {
        return { op: 'trim', args: { path } };
    },

    /** Convert to lowercase */
    lowercase(path: string): OperatorConfig {
        return { op: 'lowercase', args: { path } };
    },

    /** Convert to uppercase */
    uppercase(path: string): OperatorConfig {
        return { op: 'uppercase', args: { path } };
    },

    /** Slugify a string */
    slugify(source: string, target: string): OperatorConfig {
        return { op: 'slugify', args: { source, target } };
    },

    /** Validate with custom logic and drop invalid */
    filter(condition: RouteConditionConfig): OperatorConfig {
        return { op: 'when', args: { conditions: [condition], action: 'keep' } };
    },
};
