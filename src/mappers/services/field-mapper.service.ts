import { Injectable } from '@nestjs/common';
import { JsonValue } from '../../types/index';
import { RecordObject } from '../../runtime/executor-types';
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
} from '../transformers/string';
import { applyMathTransform } from '../transformers/number';
import { applyDateTransform } from '../transformers/date';
import { applyMapTransform, applyDefaultTransform } from '../transformers/array';
import { applyConvertTransform } from '../transformers/conversion';
import { applyConditionalTransform, applyCustomTransform, isEmpty } from '../transformers/conditional';
import {
    TransformType,
    TransformConfig,
    FieldMapping,
    MappingResult,
    MappingError,
    LookupTable,
} from '../types/transform-config.types';

export type { TransformType, TransformConfig, FieldMapping, MappingResult, MappingError, LookupTable };

@Injectable()
export class FieldMapperService {
    private lookupTables = new Map<string, LookupTable>();

    /**
     * Register a lookup table for use in transformations
     */
    registerLookupTable(table: LookupTable): void {
        this.lookupTables.set(table.name, table);
    }

    /**
     * Clear all registered lookup tables
     */
    clearLookupTables(): void {
        this.lookupTables.clear();
    }

    /**
     * Map a single record using the provided field mappings
     */
    mapRecord(
        source: RecordObject,
        mappings: FieldMapping[],
    ): MappingResult {
        const errors: MappingError[] = [];
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
                                message: `Transform error: ${err instanceof Error ? err.message : String(err)}`,
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
                    message: err instanceof Error ? err.message : String(err),
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
        mappings: FieldMapping[],
    ): { results: MappingResult[]; summary: { total: number; success: number; failed: number } } {
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
        config: TransformConfig,
        record: RecordObject,
    ): JsonValue {
        switch (config.type) {
            case 'template':
                return applyTemplateTransform(value, config.template ?? '', record, this.getNestedValue.bind(this));

            case 'lookup':
                if (!config.lookup) return value;
                return this.applyLookupTransform(value, config.lookup);

            case 'convert':
                if (!config.convert) return value;
                return applyConvertTransform(value, config.convert);

            case 'split':
                if (!config.split) return value;
                return applySplitTransform(value, config.split);

            case 'join':
                if (!config.join) return value;
                return applyJoinTransform(value, config.join, record, this.getNestedValue.bind(this));

            case 'map':
                if (!config.map) return value;
                return applyMapTransform(value, config.map);

            case 'date':
                if (!config.date) return value;
                return applyDateTransform(value, config.date);

            case 'trim':
                return applyTrimTransform(value);

            case 'lowercase':
                return applyLowercaseTransform(value);

            case 'uppercase':
                return applyUppercaseTransform(value);

            case 'replace':
                if (!config.replace) return value;
                return applyReplaceTransform(value, config.replace);

            case 'extract':
                if (!config.extract) return value;
                return applyExtractTransform(value, config.extract);

            case 'default':
                if (!config.default) return value;
                return applyDefaultTransform(value, config.default, isEmpty);

            case 'concat':
                if (!config.concat) return value;
                return applyConcatTransform(value, config.concat, record, this.getNestedValue.bind(this));

            case 'math':
                if (!config.math) return value;
                return applyMathTransform(value, config.math);

            case 'conditional':
                if (!config.conditional) return value;
                return applyConditionalTransform(value, config.conditional, record, this.getNestedValue.bind(this));

            case 'custom':
                if (!config.custom) return value;
                return applyCustomTransform(value, config.custom, record);

            default:
                return value;
        }
    }

    private applyLookupTransform(
        value: JsonValue,
        config: NonNullable<TransformConfig['lookup']>,
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
     * Get a nested value from an object using dot notation
     * Supports array access like "items[0].name"
     */
    private getNestedValue(obj: RecordObject, path: string): JsonValue | undefined {
        if (!path || !obj) return undefined;

        const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
        let current: JsonValue | undefined = obj;

        for (const part of parts) {
            if (current === null || current === undefined) {
                return undefined;
            }
            if (typeof current !== 'object' || Array.isArray(current)) {
                return undefined;
            }
            current = current[part];
        }

        return current;
    }

    /**
     * Set a nested value in an object using dot notation
     */
    private setNestedValue(obj: RecordObject, path: string, value: JsonValue | undefined): void {
        if (!path) return;
        if (value === undefined) return; // Don't set undefined values

        const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
        let current: RecordObject = obj;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            const nextPart = parts[i + 1];
            const isNextArray = /^\d+$/.test(nextPart);

            if (!(part in current)) {
                current[part] = isNextArray ? [] : {};
            }
            const next = current[part];
            if (typeof next === 'object' && next !== null && !Array.isArray(next)) {
                current = next;
            } else {
                return;
            }
        }

        current[parts[parts.length - 1]] = value;
    }
}
