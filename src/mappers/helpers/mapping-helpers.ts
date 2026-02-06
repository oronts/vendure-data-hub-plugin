/**
 * Utility functions for auto-mapping
 */

import { EntityField } from '../../types/index';
import { MapperTransformConfig } from '../types/transform-config.types';
import { SourceFieldAnalysis } from '../types/mapping-types';
import { BOOLEAN_MAPPINGS, BOOLEAN_DETECTOR_VALUES, ISO_DATE_PATTERN, SEPARATOR_PATTERN, CAMEL_CASE_PATTERN } from '../constants';

/**
 * Normalize a field name for comparison
 * Removes separators and converts to lowercase
 * Uses centralized patterns from constants
 */
export function normalizeFieldName(name: string): string {
    return name
        .toLowerCase()
        .replace(SEPARATOR_PATTERN, '')      // Remove separators
        .replace(CAMEL_CASE_PATTERN, (_, p1, p2) => p1 + p2.toLowerCase()); // camelCase to lowercase
}

/**
 * Calculate string similarity using Levenshtein distance
 */
export function calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const matrix: number[][] = [];

    for (let i = 0; i <= a.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost,
            );
        }
    }

    const distance = matrix[a.length][b.length];
    const maxLength = Math.max(a.length, b.length);
    return 1 - distance / maxLength;
}

/**
 * Check if source type is compatible with target type
 */
export function isTypeCompatible(
    sourceType: SourceFieldAnalysis['detectedType'],
    targetType: string,
): boolean {
    // Mixed and null are compatible with anything
    if (sourceType === 'mixed' || sourceType === 'null') return true;

    const compatibility: Record<string, string[]> = {
        string: ['string', 'localized-string', 'id', 'enum'],
        number: ['number', 'money'],
        boolean: ['boolean'],
        date: ['date', 'string'],
        array: ['relation', 'asset'],
        object: ['json', 'relation'],
    };

    const compatibleTargets = compatibility[sourceType] ?? [];
    return compatibleTargets.includes(targetType);
}

/**
 * Detect the type of a value
 */
export function detectValueType(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'object') return 'object';

    if (typeof value === 'string') {
        // Check if string is a date - use centralized pattern
        if (ISO_DATE_PATTERN.test(value)) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) return 'date';
        }
        // Check if string is a number
        if (value !== '' && !isNaN(Number(value))) {
            return 'number';
        }
    }

    return 'string';
}

/**
 * Calculate type compatibility score
 * @returns Score from 0-100
 */
export function calculateTypeScore(
    sourceType: SourceFieldAnalysis['detectedType'],
    targetType: string,
): number {
    // Mixed and null are compatible with anything
    if (sourceType === 'mixed' || sourceType === 'null') {
        return 50; // Neutral score
    }

    const compatible = isTypeCompatible(sourceType, targetType);
    return compatible ? 100 : 20;
}

/**
 * Calculate description match score using Jaccard similarity
 * @returns Score from 0-100
 */
export function calculateDescriptionScore(
    sourceDescription?: string,
    targetDescription?: string,
): number {
    if (!sourceDescription || !targetDescription) {
        return 50; // Neutral score if no descriptions
    }

    const sourceWords = new Set(sourceDescription.toLowerCase().split(/\W+/).filter(Boolean));
    const targetWords = new Set(targetDescription.toLowerCase().split(/\W+/).filter(Boolean));

    if (sourceWords.size === 0 || targetWords.size === 0) {
        return 50;
    }

    // Calculate Jaccard similarity
    let intersection = 0;
    for (const word of sourceWords) {
        if (targetWords.has(word)) {
            intersection++;
        }
    }

    const union = new Set([...sourceWords, ...targetWords]).size;
    const similarity = intersection / union;

    return Math.round(similarity * 100);
}

/**
 * Suggest transforms based on source and target types
 */
export function suggestTransforms(
    source: SourceFieldAnalysis,
    target: EntityField,
): MapperTransformConfig[] {
    const transforms: MapperTransformConfig[] = [];

    // String to number/money conversion
    if (source.detectedType === 'string' && (target.type === 'number' || target.type === 'money')) {
        transforms.push({
            type: 'convert',
            convert: { from: 'string', to: 'number' },
        });
    }

    // String to boolean conversion
    if (source.detectedType === 'string' && target.type === 'boolean') {
        // Check sample values to suggest map - use centralized boolean detector values
        const samples = source.sampleValues.map(v => String(v).toLowerCase());
        if (samples.some(s => BOOLEAN_DETECTOR_VALUES.includes(s))) {
            transforms.push({
                type: 'map',
                map: {
                    // Use centralized boolean mappings
                    values: BOOLEAN_MAPPINGS,
                    default: false,
                    caseSensitive: false,
                },
            });
        } else {
            transforms.push({
                type: 'convert',
                convert: { from: 'string', to: 'boolean' },
            });
        }
    }

    // String to date conversion
    if (source.detectedType === 'string' && target.type === 'date') {
        transforms.push({
            type: 'convert',
            convert: { from: 'string', to: 'date' },
        });
    }

    // Trim strings
    if (source.detectedType === 'string' && target.type === 'string') {
        transforms.push({ type: 'trim' });
    }

    // Localized string handling
    if (source.detectedType === 'string' && target.type === 'localized-string') {
        transforms.push({
            type: 'template',
            template: '${value}',
        });
    }

    return transforms;
}
