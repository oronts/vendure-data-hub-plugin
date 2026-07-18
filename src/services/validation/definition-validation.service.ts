/**
 * Main orchestrator for pipeline definition validation.
 * Delegates to specialized validation modules for different aspects of validation.
 */

import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { PipelineDefinition, StepType } from '../../types/index';
import {
    AdapterType as AdapterTypeEnum,
    PipelineStatus,
    RevisionType,
    StepType as StepTypeEnum,
} from '../../constants/enums';
import { LOGGER_CONTEXTS, STEP_TYPE_TO_ADAPTER_TYPE } from '../../constants/index';
import { Pipeline, PipelineRevision } from '../../entities/pipeline';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { validatePipelineDefinition } from '../../validation/pipeline-definition.validator';
import { PipelineDefinitionError, PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { getErrorMessage } from '../../utils/error.utils';

import { validateTrigger } from './trigger-validation';
import {
    AdapterStepConfig,
    AdapterType,
    validateAdapterConfig,
    validateAdapterFields,
    validateExtractorConfigContract,
    validateLoaderConfigContract,
    validateSinkConfigContract,
    validateGraphQLExtractor,
    validateHttpLookupConnectionContract,
    addAdapterDeprecationWarning,
    isUsingBuiltInEnrichment,
    isGraphQLExtractor,
} from './adapter-validation';
import { validateTransformOperators, TransformStepConfig } from './step-validation';
import { validateCapabilities, validateContext } from './context-validation';
import { validateHooks } from './hook-security';
import { parseInlineExportDestination } from '../destinations/inline-export-destination';
import { ResourceReferenceService } from '../config/resource-reference.service';
import { HookScriptRegistryService } from '../events/hook-script-registry.service';

// ============================================================================
// Type Definitions
// ============================================================================

export enum ValidationLevel {
    SYNTAX = 'SYNTAX',
    SEMANTIC = 'SEMANTIC',
    FULL = 'FULL',
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
        private resourceReferences: ResourceReferenceService,
        private hookScripts: HookScriptRegistryService,
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
        validateHooks(definition, issues);

        return { isValid: issues.length === 0, issues, warnings, level };
    }

    /**
     * Asynchronously validates a pipeline definition with database checks.
     */
    async validateAsync(definition: PipelineDefinition, options: ValidationOptions = {}, ctx?: RequestContext): Promise<DefinitionValidationResult> {
        const level = options.level ?? ValidationLevel.FULL;
        const result = this.validateSync(definition, { ...options, level: ValidationLevel.SEMANTIC });

        if (level !== ValidationLevel.FULL || options.skipDependencyCheck) {
            return { ...result, level };
        }

        await this.validateDependsOnAsync(definition, result, ctx);
        await this.validateResourceReferencesAsync(definition, result, ctx);
        await this.validateHookReferencesAsync(definition, result, ctx);

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
        ctx?: RequestContext,
    ): Promise<void> {
        if (!definition.dependsOn || !Array.isArray(definition.dependsOn)) {
            return;
        }

        const dependsOnCodes = definition.dependsOn.filter(c => c && typeof c === 'string');
        if (dependsOnCodes.length === 0) {
            return;
        }

        try {
            const repo = ctx
                ? this.connection.getRepository(ctx, Pipeline)
                : this.connection.rawConnection.getRepository(Pipeline);
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

    private async validateResourceReferencesAsync(
        definition: PipelineDefinition,
        result: DefinitionValidationResult,
        ctx?: RequestContext,
    ): Promise<void> {
        try {
            const missing = await this.resourceReferences
                .findMissingDefinitionReferences(ctx, definition);
            for (const code of missing.connections) {
                result.issues.push({
                    message: `Pipeline references unknown connection code "${code}"`,
                    errorCode: 'connection-unknown-code',
                });
            }
            for (const code of missing.secrets) {
                result.issues.push({
                    message: `Pipeline references unknown secret code "${code}"`,
                    errorCode: 'secret-unknown-code',
                });
            }
        } catch (error: unknown) {
            this.logger.warn('Failed to validate pipeline resource references', {
                error: getErrorMessage(error),
            });
            result.warnings.push({
                message: 'Could not verify pipeline resource references',
                errorCode: 'resource-reference-check-failed',
            });
        }
    }

    private async validateHookReferencesAsync(
        definition: PipelineDefinition,
        result: DefinitionValidationResult,
        ctx?: RequestContext,
    ): Promise<void> {
        const triggerTargets = new Map<string, Set<string>>();
        const scriptNames = new Set<string>();
        for (const actions of Object.values(definition.hooks ?? {})) {
            if (!Array.isArray(actions)) continue;
            for (const action of actions) {
                if (action.type === 'TRIGGER_PIPELINE') {
                    if (
                        typeof action.pipelineCode === 'string'
                        && typeof action.triggerKey === 'string'
                    ) {
                        const triggerKeys = triggerTargets.get(action.pipelineCode) ?? new Set<string>();
                        triggerKeys.add(action.triggerKey);
                        triggerTargets.set(action.pipelineCode, triggerKeys);
                    }
                } else if (action.type === 'SCRIPT') {
                    if (typeof action.scriptName === 'string') {
                        scriptNames.add(action.scriptName);
                    }
                }
            }
        }

        for (const scriptName of scriptNames) {
            if (!this.hookScripts.has(scriptName)) {
                result.issues.push({
                    message: `Hook references unregistered script "${scriptName}"`,
                    errorCode: 'hook-script-unknown',
                });
            }
        }
        if (triggerTargets.size === 0) {
            return;
        }

        try {
            const repository = ctx
                ? this.connection.getRepository(ctx, Pipeline)
                : this.connection.rawConnection.getRepository(Pipeline);
            const targets = await repository.find({
                where: { code: In([...triggerTargets.keys()]) },
                select: {
                    id: true,
                    code: true,
                    currentRevisionId: true,
                    enabled: true,
                    status: true,
                },
            });
            const targetsByCode = new Map(targets.map(target => [target.code, target]));
            const activeRevisionIds = targets
                .map(target => target.currentRevisionId)
                .filter((id): id is NonNullable<typeof id> => id != null);
            const revisions = activeRevisionIds.length === 0
                ? []
                : await (ctx
                    ? this.connection.getRepository(ctx, PipelineRevision)
                    : this.connection.rawConnection.getRepository(PipelineRevision)
                ).find({
                    where: {
                        id: In(activeRevisionIds),
                        type: RevisionType.PUBLISHED,
                    },
                    select: { id: true, definition: true },
                });
            const revisionsById = new Map(
                revisions.map(revision => [String(revision.id), revision.definition]),
            );

            for (const [code, triggerKeys] of triggerTargets) {
                const target = targetsByCode.get(code);
                if (!target) {
                    result.issues.push({
                        message: `TRIGGER_PIPELINE hook references unknown pipeline code "${code}"`,
                        errorCode: 'hook-pipeline-unknown',
                    });
                    continue;
                } else if (
                    target.status !== PipelineStatus.PUBLISHED
                    || !target.enabled
                    || target.currentRevisionId == null
                ) {
                    result.issues.push({
                        message: `TRIGGER_PIPELINE hook target "${code}" is not an enabled published pipeline`,
                        errorCode: 'hook-pipeline-not-runnable',
                    });
                    continue;
                }

                const targetDefinition = revisionsById.get(String(target.currentRevisionId));
                if (!targetDefinition) {
                    result.issues.push({
                        message: `TRIGGER_PIPELINE hook target "${code}" has no active published revision`,
                        errorCode: 'hook-pipeline-revision-missing',
                    });
                    continue;
                }

                for (const triggerKey of triggerKeys) {
                    const triggerStep = targetDefinition.steps.find(step => step.key === triggerKey);
                    if (
                        !triggerStep
                        || triggerStep.type !== StepTypeEnum.TRIGGER
                        || triggerStep.disabled === true
                    ) {
                        result.issues.push({
                            message: `TRIGGER_PIPELINE hook target "${code}" has no enabled trigger step "${triggerKey}"`,
                            errorCode: 'hook-trigger-not-runnable',
                        });
                        continue;
                    }
                    if (!(targetDefinition.edges ?? []).some(edge => edge.from === triggerKey)) {
                        result.issues.push({
                            message: `TRIGGER_PIPELINE hook target "${code}" trigger "${triggerKey}" has no outgoing route`,
                            errorCode: 'hook-trigger-no-route',
                        });
                    }
                }
            }
        } catch (error: unknown) {
            this.logger.warn('Failed to validate hook pipeline targets', {
                error: getErrorMessage(error),
            });
            result.warnings.push({
                message: 'Could not verify hook pipeline targets',
                errorCode: 'hook-reference-check-failed',
            });
        }
    }

    private validateAdapters(
        definition: PipelineDefinition,
        issues: PipelineDefinitionIssue[],
        warnings: PipelineDefinitionIssue[],
    ): void {
        // Only validate adapter config for step types that use adapter-based dispatch.
        // Step types like TRIGGER, VALIDATE, ROUTE, and GATE use inline config
        // (rules, branches, approval settings) and have no registered adapters.
        const ADAPTER_BASED_STEP_TYPES = new Set([
            StepTypeEnum.EXTRACT,
            StepTypeEnum.ENRICH,
            StepTypeEnum.LOAD,
            StepTypeEnum.EXPORT,
            StepTypeEnum.FEED,
            StepTypeEnum.SINK,
        ]);

        for (const step of definition.steps) {
            const type = step.type as StepType;
            const rawConfig = (step.config ?? {}) as AdapterStepConfig;
            const cfg = step.adapterCode
                ? { ...rawConfig, adapterCode: step.adapterCode }
                : rawConfig;
            const adapterType = adapterTypeFor(type);

            if (!adapterType) {
                continue;
            }

            // Handle TRANSFORM steps with operators (special validation path)
            if (type === StepTypeEnum.TRANSFORM) {
                validateTransformOperators(
                    step.key,
                    cfg as TransformStepConfig,
                    this.registry,
                    issues,
                    warnings,
                );
                continue;
            }

            // ENRICH steps can use built-in config without an adapter
            if (isUsingBuiltInEnrichment(type, cfg)) {
                if (cfg.sourceType === 'HTTP') {
                    validateHttpLookupConnectionContract(step.key, cfg, issues);
                }
                continue;
            }

            // Skip adapter validation for step types that don't use adapter-based dispatch
            if (!ADAPTER_BASED_STEP_TYPES.has(type as StepTypeEnum)) {
                continue;
            }

            // Validate adapter configuration
            const adapterResult = validateAdapterConfig(step.key, type, cfg, adapterType, this.registry, issues);
            if (!adapterResult) {
                continue;
            }

            const { adapter, adapterCode } = adapterResult;
            addAdapterDeprecationWarning(step.key, adapter, warnings);
            validateAdapterFields(step.key, cfg, adapter, issues);
            if (adapterType === AdapterTypeEnum.EXTRACTOR) {
                validateExtractorConfigContract(step.key, adapterCode, cfg, issues);
            }
            if (adapterType === AdapterTypeEnum.LOADER) {
                validateLoaderConfigContract(step.key, adapterCode, cfg, issues);
            }
            if (adapterType === AdapterTypeEnum.SINK) {
                validateSinkConfigContract(step.key, adapterCode, cfg, issues);
            }
            if (type === StepTypeEnum.EXPORT) {
                try {
                    parseInlineExportDestination(step.key, cfg);
                } catch (error) {
                    issues.push({
                        message: `Step "${step.key}": ${getErrorMessage(error)}`,
                        stepKey: step.key,
                        field: 'destinationType',
                        errorCode: 'invalid-export-destination',
                    });
                }
            }

            // Special validation for GraphQL extractors
            if (isGraphQLExtractor(adapterType, adapterCode)) {
                validateGraphQLExtractor(step.key, cfg, issues);
            }
        }
    }
}
