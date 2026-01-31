import { Injectable } from '@nestjs/common';
import { TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import {
    PipelineDefinition,
    JsonValue,
    JsonObject,
    StepType,
    TriggerConfig,
    MessageTriggerConfig,
    QueueTypeValue,
} from '../../types/index';
import { StepType as StepTypeEnum, RunMode, QueueType, LateEventsPolicy } from '../../constants/enums';
import { EXTRACTOR_CODE } from '../../constants/adapters';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { Pipeline } from '../../entities/pipeline';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { AdapterDefinition, StepConfigSchema, StepConfigSchemaField, SelectOption } from '../../sdk/types';
import { validatePipelineDefinition } from '../../validation/pipeline-definition.validator';
import { PipelineDefinitionError, PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { getErrorMessage, DataHubLogger } from '../logger';

const logger = new DataHubLogger(LOGGER_CONTEXTS.DEFINITION_VALIDATION_SERVICE);

// ============================================================================
// Type Definitions for Validation
// ============================================================================

/**
 * Trigger step configuration structure
 */
interface TriggerStepConfig extends TriggerConfig {
    message?: MessageTriggerConfig & {
        queue?: string;
    };
}

/**
 * Adapter field definition with options
 */
interface AdapterFieldDefinition {
    key: string;
    type: string;
    required?: boolean;
    options?: readonly SelectOption[];
    label?: string;
    description?: string;
}

/**
 * Operator configuration in transform steps
 */
interface OperatorConfig {
    op: string;
    params?: JsonObject;
}

/**
 * Transform step configuration
 */
interface TransformStepConfig {
    operators?: unknown[];
    adapterCode?: string;
}

/**
 * Step configuration with adapter code
 */
interface StepConfig {
    adapterCode?: string;
    query?: string;
    variables?: Record<string, JsonValue>;
    [key: string]: unknown;
}

/**
 * Pipeline capabilities structure
 */
interface PipelineCapabilitiesConfig {
    writes?: string[];
    requires?: string[];
    streamSafe?: boolean;
}

/**
 * Late events policy configuration (matching LateEventPolicy from shared types)
 */
interface LateEventsConfig {
    policy: string;
    bufferMs?: number;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if config is a trigger step config.
 * Validates that config is an object with optional trigger-specific properties.
 */
function isTriggerStepConfig(config: unknown): config is TriggerStepConfig {
    if (typeof config !== 'object' || config === null) {
        return false;
    }
    const cfg = config as Record<string, unknown>;
    // Must have a type property if it's a trigger config
    if (cfg.type !== undefined && typeof cfg.type !== 'string') {
        return false;
    }
    // message property, if present, must be an object
    if (cfg.message !== undefined && (typeof cfg.message !== 'object' || cfg.message === null)) {
        return false;
    }
    return true;
}

/**
 * Type guard to check if value is a message trigger config.
 * Validates structure has expected message trigger properties.
 */
function isMessageTriggerConfig(
    value: unknown,
): value is MessageTriggerConfig & { queue?: string } {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const cfg = value as Record<string, unknown>;
    // queueType, if present, must be a string
    if (cfg.queueType !== undefined && typeof cfg.queueType !== 'string') {
        return false;
    }
    // connectionCode, if present, must be a string
    if (cfg.connectionCode !== undefined && typeof cfg.connectionCode !== 'string') {
        return false;
    }
    // queueName, if present, must be a string
    if (cfg.queueName !== undefined && typeof cfg.queueName !== 'string') {
        return false;
    }
    // queue, if present, must be a string
    if (cfg.queue !== undefined && typeof cfg.queue !== 'string') {
        return false;
    }
    return true;
}

/**
 * Type guard to check if adapter has a valid schema
 */
function hasValidSchema(
    adapter: AdapterDefinition | undefined,
): adapter is AdapterDefinition & { schema: StepConfigSchema } {
    return (
        adapter !== undefined &&
        typeof adapter.schema === 'object' &&
        adapter.schema !== null &&
        Array.isArray(adapter.schema.fields)
    );
}

/**
 * Type guard for adapter field with options
 */
function isFieldWithOptions(
    field: StepConfigSchemaField,
): field is StepConfigSchemaField & { options: readonly SelectOption[] } {
    return Array.isArray(field.options) && field.options.length > 0;
}

/**
 * Type guard to check if value is a valid operator config.
 * Validates that op is a non-empty string and params, if present, is an object.
 */
function isOperatorConfig(value: unknown): value is OperatorConfig {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const cfg = value as Record<string, unknown>;
    // op must be a non-empty string
    if (typeof cfg.op !== 'string' || cfg.op.trim() === '') {
        return false;
    }
    // params, if present, must be an object (not array)
    if (cfg.params !== undefined) {
        if (typeof cfg.params !== 'object' || cfg.params === null || Array.isArray(cfg.params)) {
            return false;
        }
    }
    return true;
}

/**
 * Type guard to check if adapter has pure property
 */
function hasStreamSafetyInfo(
    adapter: AdapterDefinition | undefined,
): adapter is AdapterDefinition & { pure: boolean } {
    return adapter !== undefined && typeof adapter.pure === 'boolean';
}

/**
 * Safely get trigger type from config
 */
function getTriggerType(config: TriggerStepConfig): string | undefined {
    return typeof config.type === 'string' ? config.type : undefined;
}

/**
 * Safely get queue type from message config
 */
function getQueueType(
    msgConfig: MessageTriggerConfig & { queue?: string } | undefined,
): QueueTypeValue | undefined {
    if (!msgConfig) return undefined;
    const qt = msgConfig.queueType;
    return typeof qt === 'string' ? (qt as QueueTypeValue) : undefined;
}

export enum ValidationLevel {
    SYNTAX = 'syntax',
    SEMANTIC = 'semantic',
    FULL = 'full',
}

export interface ValidationOptions {
    level?: ValidationLevel;
    skipDependencyCheck?: boolean;
}

export interface DefinitionValidationResult {
    isValid: boolean;
    issues: PipelineDefinitionIssue[];
    warnings: PipelineDefinitionIssue[];
    level: ValidationLevel;
}

@Injectable()
export class DefinitionValidationService {
    constructor(
        private registry: DataHubRegistryService,
        private connection: TransactionalConnection,
    ) {}

    validateSync(definition: PipelineDefinition, options: ValidationOptions = {}): DefinitionValidationResult {
        const level = options.level ?? ValidationLevel.SEMANTIC;
        const issues: PipelineDefinitionIssue[] = [];
        const warnings: PipelineDefinitionIssue[] = [];

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

        if (definition.dependsOn && Array.isArray(definition.dependsOn)) {
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

        this.validateTrigger(definition, issues, warnings);
        this.validateAdapters(definition, issues, warnings);
        this.validateCapabilities(definition, issues);
        this.validateContext(definition, issues);

        return { isValid: issues.length === 0, issues, warnings, level };
    }

    async validateAsync(definition: PipelineDefinition, options: ValidationOptions = {}): Promise<DefinitionValidationResult> {
        const level = options.level ?? ValidationLevel.FULL;
        const result = this.validateSync(definition, { ...options, level: ValidationLevel.SEMANTIC });

        if (level !== ValidationLevel.FULL || options.skipDependencyCheck) {
            return { ...result, level };
        }

        if (definition.dependsOn && Array.isArray(definition.dependsOn)) {
            const dependsOnCodes = definition.dependsOn.filter(c => c && typeof c === 'string');
            if (dependsOnCodes.length > 0) {
                try {
                    const repo = this.connection.getRepository(Pipeline);
                    // Pre-fetch all pipelines matching the codes in a single query
                    const foundPipelines = await repo.find({
                        where: { code: In(dependsOnCodes) },
                        select: { code: true },
                    });
                    const foundCodes = new Set(foundPipelines.map(p => p.code));

                    // Report any codes that were not found
                    for (const code of dependsOnCodes) {
                        if (!foundCodes.has(code)) {
                            result.issues.push({
                                message: `dependsOn references unknown pipeline code "${code}"`,
                                errorCode: 'depends-on-unknown-code',
                            });
                        }
                    }
                } catch (e: unknown) {
                    logger.warn('Failed to validate pipeline dependencies', { error: getErrorMessage(e) });
                    result.warnings.push({
                        message: 'Could not verify pipeline dependencies',
                        errorCode: 'depends-on-check-failed',
                    });
                }
            }
        }

        return {
            isValid: result.issues.length === 0,
            issues: result.issues,
            warnings: result.warnings,
            level,
        };
    }

    validate(definition: PipelineDefinition): void {
        const result = this.validateSync(definition);
        if (!result.isValid) {
            throw new PipelineDefinitionError(result.issues);
        }
    }

    private validateTrigger(
        definition: PipelineDefinition,
        issues: PipelineDefinitionIssue[],
        _warnings: PipelineDefinitionIssue[],
    ): void {
        const triggerStep = definition.steps.find(s => s.type === StepTypeEnum.TRIGGER);
        if (!triggerStep) {
            return;
        }

        const rawConfig = triggerStep.config ?? {};
        if (!isTriggerStepConfig(rawConfig)) {
            return;
        }

        const cfg = rawConfig as TriggerStepConfig;
        const triggerType = getTriggerType(cfg);

        if (triggerType === 'message') {
            const msgCfg = isMessageTriggerConfig(cfg.message) ? cfg.message : undefined;
            const queueType = getQueueType(msgCfg);
            const queueTypeLower = queueType?.toLowerCase();

            // All supported queue types
            const supportedQueueTypes = new Set([
                QueueType.RABBITMQ,
                QueueType.RABBITMQ_AMQP,
                QueueType.SQS,
                QueueType.REDIS,
                QueueType.INTERNAL,
            ]);

            if (!queueType) {
                issues.push({
                    message: `Step "${triggerStep.key}": message trigger requires queueType (${Array.from(supportedQueueTypes).join(', ')})`,
                    stepKey: triggerStep.key,
                    errorCode: 'missing-queue-type',
                });
            } else if (!supportedQueueTypes.has(queueTypeLower as QueueType)) {
                issues.push({
                    message: `Step "${triggerStep.key}": unsupported queueType "${queueType}". Supported types: ${Array.from(supportedQueueTypes).join(', ')}`,
                    stepKey: triggerStep.key,
                    errorCode: 'unsupported-queue-type',
                });
            } else {
                // Validate required fields based on queue type
                if (!msgCfg?.connectionCode && queueTypeLower !== QueueType.INTERNAL) {
                    issues.push({
                        message: `Step "${triggerStep.key}": ${queueType} message trigger requires connectionCode`,
                        stepKey: triggerStep.key,
                        errorCode: 'missing-connection-code',
                    });
                }
                // Check for queueName or queue
                const queueName = msgCfg?.queueName ?? msgCfg?.queue;
                if (!queueName) {
                    issues.push({
                        message: `Step "${triggerStep.key}": ${queueType} message trigger requires queue name`,
                        stepKey: triggerStep.key,
                        errorCode: 'missing-queue',
                    });
                }
            }
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
            const adapterType = this.adapterTypeFor(type);
            if (!adapterType) {
                continue;
            }

            if (type === 'TRANSFORM') {
                this.validateTransformOperators(step.key, cfg as TransformStepConfig, definition, issues);
                continue;
            }

            // ENRICH steps can use built-in config without an adapter
            if (type === 'ENRICH') {
                const enrichCfg = cfg as { adapterCode?: string; defaults?: unknown; set?: unknown; computed?: unknown; sourceType?: string };
                const hasBuiltInConfig = enrichCfg.defaults || enrichCfg.set || enrichCfg.computed || enrichCfg.sourceType;
                if (!enrichCfg.adapterCode && hasBuiltInConfig) {
                    // Skip adapter validation - using built-in enrichment
                    continue;
                }
            }

            const adapterResult = this.validateAdapterConfig(step.key, type, cfg, adapterType, issues);
            if (!adapterResult) {
                continue;
            }

            const { adapter, adapterCode } = adapterResult;
            this.validateAdapterConnectivity(step.key, adapterCode, adapterType, adapter, definition, issues);
            this.validateAdapterFields(step.key, cfg, adapter, issues);

            if (adapterType === 'extractor' && adapterCode === EXTRACTOR_CODE.GRAPHQL) {
                this.validateGraphQLExtractor(step.key, cfg, issues);
            }
        }
    }

    private validateAdapterConfig(
        stepKey: string,
        stepType: StepType,
        cfg: StepConfig,
        adapterType: 'extractor' | 'operator' | 'loader' | 'exporter' | 'feed' | 'enricher' | 'sink',
        issues: PipelineDefinitionIssue[],
    ): { adapter: AdapterDefinition; adapterCode: string } | null {
        const adapterCode = cfg.adapterCode;
        if (!adapterCode || typeof adapterCode !== 'string') {
            issues.push({
                message: `Step "${stepKey}": missing adapterCode for ${stepType}`,
                stepKey,
                errorCode: 'missing-adapter-code',
            });
            return null;
        }

        const adapter = this.registry.find(adapterType, adapterCode);
        if (!adapter) {
            issues.push({
                message: `Step "${stepKey}": unknown adapter "${adapterCode}" for ${stepType}`,
                stepKey,
                errorCode: 'unknown-adapter',
            });
            return null;
        }

        return { adapter, adapterCode };
    }

    private validateAdapterConnectivity(
        stepKey: string,
        adapterCode: string,
        adapterType: 'extractor' | 'operator' | 'loader' | 'exporter' | 'feed' | 'enricher' | 'sink',
        adapter: AdapterDefinition,
        definition: PipelineDefinition,
        issues: PipelineDefinitionIssue[],
    ): void {
        if (definition.context?.runMode === RunMode.STREAM && adapterType === 'operator') {
            if (!hasStreamSafetyInfo(adapter) || adapter.pure !== true) {
                issues.push({
                    message: `Step "${stepKey}": operator "${adapterCode}" is not stream-safe (pure=false)`,
                    stepKey,
                    errorCode: 'operator-not-pure',
                });
            }
        }
    }

    private validateAdapterFields(
        stepKey: string,
        cfg: StepConfig,
        adapter: AdapterDefinition,
        issues: PipelineDefinitionIssue[],
    ): void {
        if (!hasValidSchema(adapter)) {
            return;
        }

        for (const field of adapter.schema.fields) {
            const v = cfg[field.key] as JsonValue | undefined;
            this.validateRequiredFields(stepKey, field, v, issues);
            if (v !== undefined && v !== null) {
                this.validateFieldTypes(stepKey, field, v, issues);
                this.validateFieldMappings(stepKey, field, v, issues);
            }
        }
    }

    private validateRequiredFields(
        stepKey: string,
        field: StepConfigSchemaField,
        value: JsonValue | undefined,
        issues: PipelineDefinitionIssue[],
    ): void {
        if (field.required && (value === undefined || value === null || value === '')) {
            issues.push({
                message: `Step "${stepKey}": missing required field "${field.key}"`,
                stepKey,
                field: field.key,
                errorCode: 'missing-required-field',
            });
        }
    }

    private validateFieldTypes(
        stepKey: string,
        field: StepConfigSchemaField,
        value: JsonValue,
        issues: PipelineDefinitionIssue[],
    ): void {
        const t = String(field.type).toLowerCase();
        const typeValidators: Record<string, () => boolean> = {
            string: () => typeof value === 'string',
            number: () => typeof value === 'number',
            boolean: () => typeof value === 'boolean',
            json: () => typeof value === 'object',
        };

        const validator = typeValidators[t];
        if (validator && !validator()) {
            issues.push({
                message: `Step "${stepKey}": field "${field.key}" must be ${t === 'json' ? 'JSON' : t}`,
                stepKey,
                field: field.key,
                errorCode: 'invalid-field-type',
            });
        }
    }

    private validateFieldMappings(
        stepKey: string,
        field: StepConfigSchemaField,
        value: JsonValue,
        issues: PipelineDefinitionIssue[],
    ): void {
        const t = String(field.type).toLowerCase();
        if (t !== 'select') {
            return;
        }

        if (typeof value !== 'string') {
            issues.push({
                message: `Step "${stepKey}": field "${field.key}" must be a valid option`,
                stepKey,
                field: field.key,
                errorCode: 'invalid-select-option',
            });
            return;
        }

        if (isFieldWithOptions(field)) {
            const allowed = new Set<string>(
                field.options.map((o: SelectOption) => String(o.value ?? '').toUpperCase()),
            );
            if (!allowed.has(String(value).toUpperCase())) {
                const originalOptions = field.options.map((o: SelectOption) => String(o.value ?? ''));
                issues.push({
                    message: `Step "${stepKey}": field "${field.key}" must be one of [${originalOptions.join(', ')}]`,
                    stepKey,
                    field: field.key,
                    errorCode: 'invalid-select-option',
                });
            }
        }
    }

    private validateGraphQLExtractor(
        stepKey: string,
        cfg: StepConfig,
        issues: PipelineDefinitionIssue[],
    ): void {
        const q: string | undefined = typeof cfg.query === 'string' ? cfg.query : undefined;
        if (q && q.includes('$')) {
            const vars = new Set<string>();
            try {
                const rx = /\$([A-Za-z_][A-Za-z0-9_]*)/g;
                let m: RegExpExecArray | null;
                while ((m = rx.exec(q))) {
                    if (m[1]) vars.add(m[1]);
                }
            } catch {
                // Regex execution failed - skip variable extraction for this query
            }
            const variables = cfg.variables;
            const provided =
                variables && typeof variables === 'object' && !Array.isArray(variables)
                    ? new Set<string>(Object.keys(variables))
                    : new Set<string>();
            const missingVars = Array.from(vars).filter(v => !provided.has(v));
            if (missingVars.length) {
                issues.push({
                    message: `Step "${stepKey}": GraphQL variables missing keys: ${missingVars.join(', ')}`,
                    stepKey,
                    errorCode: 'graphql-missing-variable',
                });
            }
        }
    }

    private validateCapabilities(definition: PipelineDefinition, issues: PipelineDefinitionIssue[]): void {
        if (!definition.capabilities || typeof definition.capabilities !== 'object') {
            return;
        }

        const caps = definition.capabilities as PipelineCapabilitiesConfig;

        if (caps.writes !== undefined) {
            if (!Array.isArray(caps.writes)) {
                issues.push({ message: 'capabilities.writes must be an array', errorCode: 'capabilities-invalid' });
            } else {
                const allowed = new Set(['catalog', 'customers', 'orders', 'promotions', 'inventory', 'custom']);
                for (const w of caps.writes) {
                    const lowerW = typeof w === 'string' ? w.toLowerCase() : '';
                    if (typeof w !== 'string' || !allowed.has(lowerW)) {
                        issues.push({
                            message: `capabilities.writes contains invalid domain: ${String(w)}`,
                            errorCode: 'capabilities-invalid-domain',
                        });
                    }
                }
            }
        }

        if (caps.requires !== undefined && !Array.isArray(caps.requires)) {
            issues.push({
                message: 'capabilities.requires must be an array of permission names',
                errorCode: 'capabilities-invalid',
            });
        }

        if (caps.streamSafe !== undefined && typeof caps.streamSafe !== 'boolean') {
            issues.push({
                message: 'capabilities.streamSafe must be a boolean',
                errorCode: 'capabilities-invalid',
            });
        }
    }

    private validateContext(definition: PipelineDefinition, issues: PipelineDefinitionIssue[]): void {
        if (!definition.context) {
            return;
        }

        if (definition.context.lateEvents) {
            const le = definition.context.lateEvents as LateEventsConfig;
            const policyLower = typeof le.policy === 'string' ? le.policy.toLowerCase() : '';
            if (policyLower !== LateEventsPolicy.DROP && policyLower !== LateEventsPolicy.BUFFER) {
                issues.push({
                    message: 'context.lateEvents.policy must be drop|buffer',
                    errorCode: 'context-invalid',
                });
            }
            if (policyLower === LateEventsPolicy.BUFFER && (typeof le.bufferMs !== 'number' || le.bufferMs <= 0)) {
                issues.push({
                    message: 'context.lateEvents.bufferMs must be a positive number when policy=buffer',
                    errorCode: 'context-invalid',
                });
            }
        }

        if (
            definition.context.watermarkMs !== undefined &&
            definition.context.watermarkMs !== null &&
            (typeof definition.context.watermarkMs !== 'number' || definition.context.watermarkMs < 0)
        ) {
            issues.push({
                message: 'context.watermarkMs must be a non-negative number',
                errorCode: 'context-invalid',
            });
        }
    }

    private validateTransformOperators(
        stepKey: string,
        cfg: TransformStepConfig,
        definition: PipelineDefinition,
        issues: PipelineDefinitionIssue[],
    ): void {
        const operators = cfg.operators;
        if (!this.validateOperatorChain(stepKey, operators, issues)) {
            return;
        }

        for (let i = 0; i < operators.length; i++) {
            this.validateOperatorParams(stepKey, operators[i], i, definition, issues);
        }
    }

    private validateOperatorChain(
        stepKey: string,
        operators: unknown,
        issues: PipelineDefinitionIssue[],
    ): operators is OperatorConfig[] {
        if (!operators || !Array.isArray(operators)) {
            issues.push({
                message: `Step "${stepKey}": TRANSFORM step requires operators array`,
                stepKey,
                errorCode: 'missing-operators',
            });
            return false;
        }

        if (operators.length === 0) {
            issues.push({
                message: `Step "${stepKey}": operators array is empty`,
                stepKey,
                errorCode: 'empty-operators',
            });
            return false;
        }

        return true;
    }

    private validateOperatorParams(
        stepKey: string,
        op: unknown,
        index: number,
        definition: PipelineDefinition,
        issues: PipelineDefinitionIssue[],
    ): void {
        if (!isOperatorConfig(op)) {
            issues.push({
                message: `Step "${stepKey}": operator ${index} is not a valid object`,
                stepKey,
                errorCode: 'invalid-operator',
            });
            return;
        }

        const opCode = op.op;
        if (!opCode || typeof opCode !== 'string') {
            issues.push({
                message: `Step "${stepKey}": operator ${index} missing "op" field`,
                stepKey,
                errorCode: 'missing-operator-code',
            });
            return;
        }

        const adapter = this.registry.find('operator', opCode);
        if (!adapter) {
            issues.push({
                message: `Step "${stepKey}": unknown operator "${opCode}"`,
                stepKey,
                errorCode: 'unknown-operator',
            });
            return;
        }

        if (definition.context?.runMode === RunMode.STREAM && !hasStreamSafetyInfo(adapter)) {
            issues.push({
                message: `Step "${stepKey}": operator "${opCode}" is not stream-safe (pure=false)`,
                stepKey,
                errorCode: 'operator-not-pure',
            });
        } else if (definition.context?.runMode === RunMode.STREAM && hasStreamSafetyInfo(adapter) && adapter.pure !== true) {
            issues.push({
                message: `Step "${stepKey}": operator "${opCode}" is not stream-safe (pure=false)`,
                stepKey,
                errorCode: 'operator-not-pure',
            });
        }
    }

    private static readonly STEP_TYPE_TO_ADAPTER_TYPE: Partial<Record<StepType, 'extractor' | 'operator' | 'loader' | 'exporter' | 'feed' | 'enricher' | 'sink'>> = {
        [StepTypeEnum.EXTRACT]: 'extractor',
        [StepTypeEnum.TRANSFORM]: 'operator',
        [StepTypeEnum.LOAD]: 'loader',
        [StepTypeEnum.EXPORT]: 'exporter',
        [StepTypeEnum.FEED]: 'feed',
        [StepTypeEnum.ENRICH]: 'enricher',
        [StepTypeEnum.SINK]: 'sink',
    };

    private adapterTypeFor(
        stepType: StepType,
    ): 'extractor' | 'operator' | 'loader' | 'exporter' | 'feed' | 'enricher' | 'sink' | null {
        return DefinitionValidationService.STEP_TYPE_TO_ADAPTER_TYPE[stepType] ?? null;
    }
}
