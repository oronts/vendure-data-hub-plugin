import { Injectable } from '@nestjs/common';
import { JsonValue } from '../../types/index';
import { RecordObject } from '../../runtime/executor-types';
import { getErrorMessage } from '../../utils/error.utils';
import { getNestedValue as getNestedValueCanonical, setNestedValue as setNestedValueCanonical } from '../../utils/object-path.utils';
import {
    applyTemplateTransform,
    applySplitTransform,
    applyJoinTransform,
    applyReplaceTransform,
    applyExtractTransform,
    applyConcatTransform,
    applyTrimTransform,
    applyLowercaseTransform,
    applyUppercaseTransform,
} from '../transformers/string/string-transformers';
import { applyMathTransform } from '../transformers/number/number-transformers';
import { applyDateTransform } from '../transformers/date/date-transformers';
import { applyMapTransform, applyDefaultTransform } from '../transformers/array/array-transformers';
import { applyConvertTransform } from '../transformers/conversion/conversion-transformers';
import { applyConditionalTransform, applyCustomTransform, isEmpty } from '../transformers/conditional/conditional-transformers';
import {
    MapperTransformType,
    MapperTransformConfig,
    MapperFieldMapping,
    MapperMappingResult,
    MapperMappingError,
    MapperLookupTable,
} from '../types/transform-config.types';

export type {
    MapperTransformType,
    MapperTransformConfig,
    MapperFieldMapping,
    MapperMappingResult,
    MapperMappingError,
    MapperLookupTable,
};

/** Handler signature for mapper transform operations */
type MapperTransformHandler = (value: JsonValue, config: MapperTransformConfig, record: RecordObject) => JsonValue;

/** Maximum number of lookup tables that can be registered */
const MAX_LOOKUP_TABLES = 200;

@Injectable()
export class FieldMapperService {
    private lookupTables = new Map<string, MapperLookupTable>();
    private readonly transformHandlers: Map<MapperTransformType, MapperTransformHandler>;

    constructor() {
        const boundGetNestedValue = this.getNestedValue.bind(this);

        this.transformHandlers = new Map<MapperTransformType, MapperTransformHandler>([
            ['template', (value, config, record) =>
                applyTemplateTransform(value, config.template ?? '', record, boundGetNestedValue)],
            ['lookup', (value, config) =>
                config.lookup ? this.applyLookupTransform(value, config.lookup) : value],
            ['convert', (value, config) =>
                config.convert ? applyConvertTransform(value, config.convert) : value],
            ['split', (value, config) =>
                config.split ? applySplitTransform(value, config.split) : value],
            ['join', (value, config, record) =>
                config.join ? applyJoinTransform(value, config.join, record, boundGetNestedValue) : value],
            ['map', (value, config) =>
                config.map ? applyMapTransform(value, config.map) : value],
            ['date', (value, config) =>
                config.date ? applyDateTransform(value, config.date) : value],
            ['trim', (value) =>
                applyTrimTransform(value)],
            ['lowercase', (value) =>
                applyLowercaseTransform(value)],
            ['uppercase', (value) =>
                applyUppercaseTransform(value)],
            ['replace', (value, config) =>
                config.replace ? applyReplaceTransform(value, config.replace) : value],
            ['extract', (value, config) =>
                config.extract ? applyExtractTransform(value, config.extract) : value],
            ['default', (value, config) =>
                config.default ? applyDefaultTransform(value, config.default, isEmpty) : value],
            ['concat', (value, config, record) =>
                config.concat ? applyConcatTransform(value, config.concat, record, boundGetNestedValue) : value],
            ['math', (value, config) =>
                config.math ? applyMathTransform(value, config.math) : value],
            ['conditional', (value, config, record) =>
                config.conditional ? applyConditionalTransform(value, config.conditional, record, boundGetNestedValue) : value],
            ['custom', (value, config, record) =>
                config.custom ? applyCustomTransform(value, config.custom, record) : value],
        ]);
    }

    /**
     * Register a lookup table for use in transformations
     */
    registerMapperLookupTable(table: MapperLookupTable): void {
        if (!this.lookupTables.has(table.name) && this.lookupTables.size >= MAX_LOOKUP_TABLES) {
            throw new Error(`Lookup table registry is full (max ${MAX_LOOKUP_TABLES}). Clear existing tables before registering new ones.`);
        }
        this.lookupTables.set(table.name, table);
    }

    /**
     * Clear all registered lookup tables
     */
    clearMapperLookupTables(): void {
        this.lookupTables.clear();
    }

    /**
     * Map a single record using the provided field mappings
     */
    mapRecord(
        source: RecordObject,
        mappings: MapperFieldMapping[],
    ): MapperMappingResult {
        const errors: MapperMappingError[] = [];
        const warnings: string[] = [];
        const data: RecordObject = {};

        for (const mapping of mappings) {
            try {
                let value = this.getNestedValue(source, mapping.source);

                if (isEmpty(value) && mapping.defaultValue !== undefined) {
                    value = mapping.defaultValue;
                }

                if (mapping.required && isEmpty(value)) {
                    errors.push({
                        field: mapping.source,
                        message: `Required field "${mapping.source}" is empty`,
                    });
                    continue;
                }

                if (mapping.transforms?.length && !isEmpty(value) && value !== undefined) {
                    for (const transform of mapping.transforms) {
                        try {
                            value = this.applyTransform(value, transform, source);
                        } catch (err) {
                            errors.push({
                                field: mapping.source,
                                message: `Transform error: ${getErrorMessage(err)}`,
                                value: value ?? null,
                            });
                        }
                    }
                }

                if (!isEmpty(value) || !mapping.required) {
                    this.setNestedValue(data, mapping.target, value);
                }
            } catch (err) {
                errors.push({
                    field: mapping.source,
                    message: getErrorMessage(err),
                });
            }
        }

        return {
            success: errors.length === 0,
            data,
            errors,
            warnings,
        };
    }

    /**
     * Map multiple records
     */
    mapRecords(
        sources: RecordObject[],
        mappings: MapperFieldMapping[],
    ): { results: MapperMappingResult[]; summary: { total: number; success: number; failed: number } } {
        const results = sources.map(source => this.mapRecord(source, mappings));
        const success = results.filter(r => r.success).length;

        return {
            results,
            summary: {
                total: sources.length,
                success,
                failed: sources.length - success,
            },
        };
    }

    /**
     * Apply a single transform to a value
     */
    private applyTransform(
        value: JsonValue,
        config: MapperTransformConfig,
        record: RecordObject,
    ): JsonValue {
        const handler = this.transformHandlers.get(config.type);
        return handler ? handler(value, config, record) : value;
    }

    private applyLookupTransform(
        value: JsonValue,
        config: NonNullable<MapperTransformConfig['lookup']>,
    ): JsonValue {
        const table = this.lookupTables.get(config.table);
        if (!table) {
            return config.default ?? value;
        }

        const found = table.data.find(row => row[config.fromField] === value);
        if (found) {
            return found[config.toField];
        }

        return config.default ?? value;
    }

    /**
     * Get a nested value from an object using dot notation.
     * Normalizes bracket syntax (e.g. "items[0].name" -> "items.0.name")
     * then delegates to the canonical getNestedValue with prototype-pollution protection.
     */
    private getNestedValue(obj: RecordObject, path: string): JsonValue | undefined {
        if (!path || !obj) return undefined;
        const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
        return getNestedValueCanonical(obj, normalizedPath);
    }

    /**
     * Set a nested value in an object using dot notation.
     * Delegates to the canonical setNestedValue with prototype-pollution protection
     * and array bracket notation support.
     */
    private setNestedValue(obj: RecordObject, path: string, value: JsonValue | undefined): void {
        setNestedValueCanonical(obj, path, value as JsonValue);
    }
}
