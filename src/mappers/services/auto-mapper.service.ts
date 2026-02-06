import { Injectable, Optional } from '@nestjs/common';
import { JsonValue, EntityFieldSchema, VendureEntityType } from '../../types/index';
import { RecordObject } from '../../runtime/executor-types';
import { MapperFieldMapping } from './field-mapper.service';
import {
    AutoMapperConfig,
    DEFAULT_AUTO_MAPPER_CONFIG,
} from '../types/auto-mapper-config.types';
import {
    MatchConfidence,
    MappingSuggestion,
    SourceFieldAnalysis,
    SuggestMappingsOptions,
    NameScoreResult,
} from '../types/mapping-types';
import {
    normalizeFieldName,
    detectValueType,
    calculateTypeScore,
    calculateDescriptionScore,
    suggestTransforms,
} from '../helpers/mapping-helpers';
import {
    ExactMatchStrategy,
    NormalizedMatchStrategy,
    PartialMatchStrategy,
    FuzzyMatchStrategy,
    AliasMatchStrategy,
} from '../mapping-strategies';
import { TRUNCATION, scoreToConfidence, confidenceToMinScore } from '../../constants/index';
import { LoaderRegistryService } from '../../loaders/registry';

export type { MatchConfidence, MappingSuggestion, SourceFieldAnalysis, SuggestMappingsOptions };

@Injectable()
export class AutoMapperService {
    /** Current configuration (defaults applied) */
    private config: AutoMapperConfig = { ...DEFAULT_AUTO_MAPPER_CONFIG };

    /** Matching strategies */
    private exactMatchStrategy = new ExactMatchStrategy();
    private normalizedMatchStrategy = new NormalizedMatchStrategy();
    private partialMatchStrategy = new PartialMatchStrategy();
    private fuzzyMatchStrategy: FuzzyMatchStrategy;
    private aliasMatchStrategy: AliasMatchStrategy;

    constructor(@Optional() private loaderRegistry?: LoaderRegistryService) {
        this.fuzzyMatchStrategy = new FuzzyMatchStrategy(this.config.enableFuzzyMatching);
        this.aliasMatchStrategy = new AliasMatchStrategy(
            this.config.customAliases,
            this.config.caseSensitive,
        );
    }

    /**
     * Get entity schema from LoaderRegistry
     */
    private getEntitySchema(entityType: string): EntityFieldSchema | undefined {
        if (!this.loaderRegistry) return undefined;
        return this.loaderRegistry.getFieldSchema(entityType as VendureEntityType);
    }

    /**
     * Get the current AutoMapper configuration
     */
    getConfig(): AutoMapperConfig {
        return { ...this.config };
    }

    /**
     * Update the AutoMapper configuration
     */
    setConfig(config: Partial<AutoMapperConfig>): void {
        this.config = {
            ...this.config,
            ...config,
            weights: {
                ...this.config.weights,
                ...(config.weights ?? {}),
            },
            customAliases: {
                ...this.config.customAliases,
                ...(config.customAliases ?? {}),
            },
            excludeFields: config.excludeFields ?? this.config.excludeFields,
        };
        this.updateStrategies();
    }

    /**
     * Reset configuration to defaults
     */
    resetConfig(): void {
        this.config = { ...DEFAULT_AUTO_MAPPER_CONFIG };
        this.updateStrategies();
    }

    /**
     * Update strategies when config changes
     */
    private updateStrategies(): void {
        this.fuzzyMatchStrategy.setEnabled(this.config.enableFuzzyMatching);
        this.aliasMatchStrategy = new AliasMatchStrategy(
            this.config.customAliases,
            this.config.caseSensitive,
        );
    }

    /**
     * Generate auto-mapping suggestions for source fields to a target entity
     */
    suggestMappings(
        sourceFields: SourceFieldAnalysis[],
        targetEntity: string,
        options: SuggestMappingsOptions = {},
        configOverride?: Partial<AutoMapperConfig>,
    ): MappingSuggestion[] {
        const schema = this.getEntitySchema(targetEntity);
        if (!schema) {
            return [];
        }

        const effectiveConfig = configOverride
            ? this.mergeConfig(this.config, configOverride)
            : this.config;

        const suggestions: MappingSuggestion[] = [];
        const usedTargets = new Set<string>();

        const minScoreFromThreshold = Math.round(effectiveConfig.confidenceThreshold * 100);
        const minScoreFromOption = confidenceToMinScore(options.minConfidence);
        const minScore = Math.max(minScoreFromThreshold, minScoreFromOption);

        const excludeSet = new Set(
            effectiveConfig.excludeFields.map(f =>
                effectiveConfig.caseSensitive ? f : f.toLowerCase()
            )
        );

        const filteredSources = sourceFields.filter(source => {
            const key = effectiveConfig.caseSensitive ? source.name : source.name.toLowerCase();
            return !excludeSet.has(key);
        });

        const sortedSources = [...filteredSources].sort((a, b) => b.name.length - a.name.length);

        for (const source of sortedSources) {
            const matches = this.findMatches(source, schema, options.includeCustomFields, effectiveConfig);

            for (const match of matches) {
                if (match.score >= minScore && !usedTargets.has(match.target)) {
                    suggestions.push(match);
                    usedTargets.add(match.target);
                    break;
                }
            }
        }

        return suggestions.sort((a, b) => b.score - a.score);
    }

    /**
     * Analyze source fields from sample data
     */
    analyzeSourceFields(records: RecordObject[]): SourceFieldAnalysis[] {
        if (!records.length) return [];

        const fieldStats = new Map<string, {
            types: Map<string, number>;
            samples: JsonValue[];
            nullCount: number;
            uniqueValues: Set<JsonValue>;
            totalLength: number;
            lengthCount: number;
            numericValues: number[];
        }>();

        const allFields = new Set<string>();
        for (const record of records) {
            if (record && typeof record === 'object') {
                for (const key of Object.keys(record)) {
                    allFields.add(key);
                }
            }
        }

        for (const field of allFields) {
            fieldStats.set(field, {
                types: new Map(),
                samples: [],
                nullCount: 0,
                uniqueValues: new Set(),
                totalLength: 0,
                lengthCount: 0,
                numericValues: [],
            });
        }

        for (const record of records) {
            for (const field of allFields) {
                const stats = fieldStats.get(field);
                if (!stats) continue;
                const value = record?.[field];

                if (value === null || value === undefined || value === '') {
                    stats.nullCount++;
                } else {
                    const type = detectValueType(value);
                    stats.types.set(type, (stats.types.get(type) ?? 0) + 1);

                    if (stats.samples.length < TRUNCATION.SAMPLE_VALUES_LIMIT) {
                        stats.samples.push(value);
                    }

                    if (stats.uniqueValues.size < TRUNCATION.MAX_UNIQUE_VALUES) {
                        stats.uniqueValues.add(value);
                    }

                    if (typeof value === 'string') {
                        stats.totalLength += value.length;
                        stats.lengthCount++;
                    }

                    if (typeof value === 'number') {
                        stats.numericValues.push(value);
                    }
                }
            }
        }

        const results: SourceFieldAnalysis[] = [];
        const totalRecords = records.length;

        for (const [name, stats] of fieldStats) {
            const types = Array.from(stats.types.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([type]) => type);

            let detectedType: SourceFieldAnalysis['detectedType'] = 'null';
            if (types.length === 0) {
                detectedType = 'null';
            } else if (types.length === 1) {
                detectedType = types[0] as SourceFieldAnalysis['detectedType'];
            } else {
                detectedType = 'mixed';
            }

            const analysis: SourceFieldAnalysis = {
                name,
                detectedType,
                sampleValues: stats.samples,
                nullRatio: stats.nullCount / totalRecords,
                uniqueRatio: stats.uniqueValues.size / Math.max(1, totalRecords - stats.nullCount),
            };

            if (stats.lengthCount > 0) {
                analysis.avgLength = stats.totalLength / stats.lengthCount;
            }

            if (stats.numericValues.length > 0) {
                analysis.minValue = Math.min(...stats.numericValues);
                analysis.maxValue = Math.max(...stats.numericValues);
            }

            results.push(analysis);
        }

        return results;
    }

    /**
     * Generate field mappings from suggestions
     */
    suggestionsToMappings(suggestions: MappingSuggestion[]): MapperFieldMapping[] {
        return suggestions.map(s => ({
            source: s.source,
            target: s.target,
            transforms: s.suggestedTransforms,
            required: false,
        }));
    }

    /**
     * Validate mappings against a target schema
     */
    validateMappings(
        mappings: MapperFieldMapping[],
        targetEntity: string,
    ): { valid: boolean; errors: string[]; warnings: string[] } {
        const schema = this.getEntitySchema(targetEntity);
        if (!schema) {
            return { valid: false, errors: [`Unknown entity: ${targetEntity}`], warnings: [] };
        }

        const errors: string[] = [];
        const warnings: string[] = [];
        const mappedTargets = new Set<string>();

        const fieldMap = new Map(schema.fields.map(f => [f.key, f]));

        for (const mapping of mappings) {
            if (mappedTargets.has(mapping.target)) {
                errors.push(`Duplicate mapping to target: ${mapping.target}`);
            }
            mappedTargets.add(mapping.target);

            const targetPath = mapping.target.split('.');
            const rootField = targetPath[0];

            if (rootField !== 'customFields' && !fieldMap.has(rootField)) {
                errors.push(`Unknown target field: ${mapping.target}`);
            }

            const field = fieldMap.get(rootField);
            if (field?.readonly) {
                errors.push(`Cannot map to readonly field: ${mapping.target}`);
            }
        }

        for (const field of schema.fields) {
            if (field.required && !mappedTargets.has(field.key)) {
                warnings.push(`Required field not mapped: ${field.key}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    /**
     * Merge base config with override
     */
    private mergeConfig(base: AutoMapperConfig, override: Partial<AutoMapperConfig>): AutoMapperConfig {
        return {
            ...base,
            ...override,
            weights: {
                ...base.weights,
                ...(override.weights ?? {}),
            },
            customAliases: {
                ...base.customAliases,
                ...(override.customAliases ?? {}),
            },
            excludeFields: override.excludeFields ?? base.excludeFields,
        };
    }

    /**
     * Find matching target fields for a source field
     */
    private findMatches(
        source: SourceFieldAnalysis,
        schema: EntityFieldSchema,
        includeCustomFields = true,
        config: AutoMapperConfig = this.config,
    ): MappingSuggestion[] {
        const matches: MappingSuggestion[] = [];

        const sourceForComparison = config.caseSensitive ? source.name : source.name.toLowerCase();
        const sourceNormalized = normalizeFieldName(source.name);

        for (const targetField of schema.fields) {
            const targetKey = targetField.key;

            if (targetField.readonly) continue;

            const targetForComparison = config.caseSensitive ? targetKey : targetKey.toLowerCase();
            const targetNormalized = normalizeFieldName(targetKey);

            const nameScore = this.calculateNameScore(
                sourceForComparison,
                sourceNormalized,
                targetForComparison,
                targetNormalized,
                targetKey,
                config
            );

            const typeScore = config.enableTypeInference
                ? calculateTypeScore(source.detectedType, targetField.type)
                : 50;

            const descriptionScore = calculateDescriptionScore(
                source.description,
                targetField.description
            );

            const weights = config.weights;
            const weightedScore = Math.round(
                nameScore.score * weights.nameSimilarity +
                typeScore * weights.typeCompatibility +
                descriptionScore * weights.descriptionMatch
            );

            if (weightedScore > 0 || nameScore.score > 0) {
                const finalScore = Math.min(100, Math.max(0, weightedScore));
                const reasons: string[] = [];

                if (nameScore.reason) reasons.push(nameScore.reason);
                if (config.enableTypeInference) {
                    if (typeScore >= 80) reasons.push('type compatible');
                    else if (typeScore <= 30) reasons.push('type mismatch');
                }
                if (descriptionScore > 60) reasons.push('description match');

                const suggestion: MappingSuggestion = {
                    source: source.name,
                    target: targetKey,
                    score: finalScore,
                    confidence: scoreToConfidence(finalScore),
                    reason: reasons.join(', ') || 'No strong match',
                };

                if (config.enableTypeInference) {
                    const transforms = suggestTransforms(source, targetField);
                    if (transforms.length > 0) {
                        suggestion.suggestedTransforms = transforms;
                    }
                }

                matches.push(suggestion);
            }
        }

        const hasCustomFields = schema.fields.some(f => f.key === 'customFields');
        if (includeCustomFields && hasCustomFields) {
            const suggestion: MappingSuggestion = {
                source: source.name,
                target: `customFields.${source.name}`,
                score: 20,
                confidence: 'low',
                reason: 'Custom field fallback',
            };
            matches.push(suggestion);
        }

        return matches.sort((a, b) => b.score - a.score);
    }

    /**
     * Calculate name similarity score using multiple strategies
     */
    private calculateNameScore(
        sourceForComparison: string,
        sourceNormalized: string,
        targetForComparison: string,
        targetNormalized: string,
        targetKey: string,
        config: AutoMapperConfig,
    ): NameScoreResult {
        // Try strategies in order of priority
        const strategies = [
            this.exactMatchStrategy,
            this.normalizedMatchStrategy,
            this.aliasMatchStrategy,
            this.partialMatchStrategy,
        ];

        // Add fuzzy strategy if enabled
        if (config.enableFuzzyMatching) {
            strategies.push(this.fuzzyMatchStrategy);
        }

        for (const strategy of strategies) {
            const result = strategy.match(
                sourceForComparison,
                sourceNormalized,
                targetForComparison,
                targetNormalized,
                targetKey,
            );
            if (result) {
                return result;
            }
        }

        return { score: 0, reason: '' };
    }
}
