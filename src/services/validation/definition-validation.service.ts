/**
 * Main orchestrator for pipeline definition validation.
 * Delegates to specialized validation modules for different aspects of validation.
 */

import { Injectable } from '@nestjs/common';
import { TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { PipelineDefinition, StepType } from '../../types/index';
import { StepType as StepTypeEnum } from '../../constants/enums';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { Pipeline } from '../../entities/pipeline';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { validatePipelineDefinition } from '../../validation/pipeline-definition.validator';
import { PipelineDefinitionError, PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { getErrorMessage } from '../../utils/error.utils';

// Import specialized validators
import { validateTrigger } from './trigger-validation';
import {
    StepConfig,
    AdapterType,
    validateAdapterConfig,
    validateAdapterConnectivity,
    validateAdapterFields,
    validateGraphQLExtractor,
    isUsingBuiltInEnrichment,
    isGraphQLExtractor,
} from './adapter-validation';
import { validateTransformOperators, TransformStepConfig } from './step-validation';
import { validateCapabilities, validateContext } from './context-validation';

// ============================================================================
// Type Definitions
// ============================================================================

export enum ValidationLevel {
    SYNTAX = 'syntax',
    SEMANTIC = 'semantic',
    FULL = 'full',
}

interface ValidationOptions {
    level?: ValidationLevel;
    skipDependencyCheck?: boolean;
}

interface DefinitionValidationResult {
    isValid: boolean;
    issues: PipelineDefinitionIssue[];
    warnings: PipelineDefinitionIssue[];
    level: ValidationLevel;
}

// ============================================================================
// Step Type to Adapter Type Mapping
// ============================================================================

const STEP_TYPE_TO_ADAPTER_TYPE: Partial<Record<StepType, AdapterType>> = {
    [StepTypeEnum.EXTRACT]: 'EXTRACTOR',
    [StepTypeEnum.TRANSFORM]: 'OPERATOR',
    [StepTypeEnum.LOAD]: 'LOADER',
    [StepTypeEnum.EXPORT]: 'EXPORTER',
    [StepTypeEnum.FEED]: 'FEED',
    [StepTypeEnum.ENRICH]: 'ENRICHER',
    [StepTypeEnum.SINK]: 'SINK',
};

function adapterTypeFor(stepType: StepType): AdapterType | null {
    return STEP_TYPE_TO_ADAPTER_TYPE[stepType] ?? null;
}

// ============================================================================
// Main Service
// ============================================================================

@Injectable()
export class DefinitionValidationService {
    private readonly logger: DataHubLogger;

    constructor(
        private registry: DataHubRegistryService,
        private connection: TransactionalConnection,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.DEFINITION_VALIDATION_SERVICE);
    }

    /**
     * Synchronously validates a pipeline definition.
     */
    validateSync(definition: PipelineDefinition, options: ValidationOptions = {}): DefinitionValidationResult {
        const level = options.level ?? ValidationLevel.SEMANTIC;
        const issues: PipelineDefinitionIssue[] = [];
        const warnings: PipelineDefinitionIssue[] = [];

        // Structural validation
        try {
            validatePipelineDefinition(definition);
        } catch (e: unknown) {
            if (e instanceof PipelineDefinitionError) {
                issues.push(...e.issues);
            } else {
                issues.push({ message: getErrorMessage(e) || 'Structural validation failed', errorCode: 'structural-error' });
            }
            return { isValid: false, issues, warnings, level };
        }

        if (level === ValidationLevel.SYNTAX) {
            return { isValid: issues.length === 0, issues, warnings, level };
        }

        // Semantic validation
        this.validateDependsOn(definition, issues);
        validateTrigger(definition, issues, warnings);
        this.validateAdapters(definition, issues, warnings);
        validateCapabilities(definition, issues);
        validateContext(definition, issues);

        return { isValid: issues.length === 0, issues, warnings, level };
    }

    /**
     * Asynchronously validates a pipeline definition with database checks.
     */
    async validateAsync(definition: PipelineDefinition, options: ValidationOptions = {}): Promise<DefinitionValidationResult> {
        const level = options.level ?? ValidationLevel.FULL;
        const result = this.validateSync(definition, { ...options, level: ValidationLevel.SEMANTIC });

        if (level !== ValidationLevel.FULL || options.skipDependencyCheck) {
            return { ...result, level };
        }

        await this.validateDependsOnAsync(definition, result);

        return {
            isValid: result.issues.length === 0,
            issues: result.issues,
            warnings: result.warnings,
            level,
        };
    }

    /**
     * Validates and throws if invalid.
     */
    validate(definition: PipelineDefinition): void {
        const result = this.validateSync(definition);
        if (!result.isValid) {
            throw new PipelineDefinitionError(result.issues);
        }
    }

    // ========================================================================
    // Private Validation Methods
    // ========================================================================

    private validateDependsOn(definition: PipelineDefinition, issues: PipelineDefinitionIssue[]): void {
        if (!definition.dependsOn || !Array.isArray(definition.dependsOn)) {
            return;
        }

        const seen = new Set<string>();
        for (const code of definition.dependsOn) {
            if (!code || typeof code !== 'string') {
                issues.push({ message: 'dependsOn contains an invalid code', errorCode: 'depends-on-invalid-code' });
                continue;
            }
            if (seen.has(code)) {
                issues.push({ message: `dependsOn contains duplicate code "${code}"`, errorCode: 'depends-on-duplicate-code' });
            }
            seen.add(code);
        }
    }

    private async validateDependsOnAsync(
        definition: PipelineDefinition,
        result: DefinitionValidationResult,
    ): Promise<void> {
        if (!definition.dependsOn || !Array.isArray(definition.dependsOn)) {
            return;
        }

        const dependsOnCodes = definition.dependsOn.filter(c => c && typeof c === 'string');
        if (dependsOnCodes.length === 0) {
            return;
        }

        try {
            const repo = this.connection.getRepository(Pipeline);
            const foundPipelines = await repo.find({
                where: { code: In(dependsOnCodes) },
                select: { code: true },
            });
            const foundCodes = new Set(foundPipelines.map(p => p.code));

            for (const code of dependsOnCodes) {
                if (!foundCodes.has(code)) {
                    result.issues.push({
                        message: `dependsOn references unknown pipeline code "${code}"`,
                        errorCode: 'depends-on-unknown-code',
                    });
                }
            }
        } catch (e: unknown) {
            this.logger.warn('Failed to validate pipeline dependencies', { error: getErrorMessage(e) });
            result.warnings.push({
                message: 'Could not verify pipeline dependencies',
                errorCode: 'depends-on-check-failed',
            });
        }
    }

    private validateAdapters(
        definition: PipelineDefinition,
        issues: PipelineDefinitionIssue[],
        _warnings: PipelineDefinitionIssue[],
    ): void {
        for (const step of definition.steps) {
            const type = step.type as StepType;
            const cfg = (step.config ?? {}) as StepConfig;
            const adapterType = adapterTypeFor(type);

            if (!adapterType) {
                continue;
            }

            // Handle TRANSFORM steps with operators
            if (type === 'TRANSFORM') {
                validateTransformOperators(step.key, cfg as TransformStepConfig, definition, this.registry, issues);
                continue;
            }

            // ENRICH steps can use built-in config without an adapter
            if (isUsingBuiltInEnrichment(type, cfg)) {
                continue;
            }

            // Validate adapter configuration
            const adapterResult = validateAdapterConfig(step.key, type, cfg, adapterType, this.registry, issues);
            if (!adapterResult) {
                continue;
            }

            const { adapter, adapterCode } = adapterResult;
            validateAdapterConnectivity(step.key, adapterCode, adapterType, adapter, definition, issues);
            validateAdapterFields(step.key, cfg, adapter, issues);

            // Special validation for GraphQL extractors
            if (isGraphQLExtractor(adapterType, adapterCode)) {
                validateGraphQLExtractor(step.key, cfg, issues);
            }
        }
    }
}
