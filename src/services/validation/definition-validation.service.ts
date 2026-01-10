import { Injectable } from '@nestjs/common';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { PipelineDefinition, StepType } from '../../types/index';
import { validatePipelineDefinition } from '../../validation/pipeline-definition.validator';
import { Logger, TransactionalConnection } from '@vendure/core';
import { Pipeline } from '../../entities/pipeline';
import { PipelineDefinitionError, PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';

/**
 * Validation levels for different contexts
 */
export enum ValidationLevel {
    /** Quick structural validation only */
    SYNTAX = 'syntax',
    /** Structure + adapter checks (no async operations) */
    SEMANTIC = 'semantic',
    /** Full validation including dependency checks (async) */
    FULL = 'full',
}

export interface ValidationOptions {
    level?: ValidationLevel;
    /** Skip dependency existence checks (useful for faster validation) */
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

    /**
     * Synchronous validation for quick checks (no async operations)
     * Use for real-time validation in UI
     */
    validateSync(definition: PipelineDefinition, options: ValidationOptions = {}): DefinitionValidationResult {
        const level = options.level ?? ValidationLevel.SEMANTIC;
        const issues: PipelineDefinitionIssue[] = [];
        const warnings: PipelineDefinitionIssue[] = [];

        try {
            // Structural validation
            validatePipelineDefinition(definition);
        } catch (e: any) {
            if (e instanceof PipelineDefinitionError) {
                issues.push(...e.issues);
            } else {
                issues.push({ message: e.message || 'Structural validation failed', reason: 'structural-error' });
            }
            // Return early on structural errors
            return { isValid: false, issues, warnings, level };
        }

        if (level === ValidationLevel.SYNTAX) {
            return { isValid: issues.length === 0, issues, warnings, level };
        }

        // dependsOn validation: duplicates only (existence checked in async version)
        if (definition.dependsOn && Array.isArray(definition.dependsOn)) {
            const seen = new Set<string>();
            for (const code of definition.dependsOn) {
                if (!code || typeof code !== 'string') {
                    issues.push({ message: 'dependsOn contains an invalid code', reason: 'depends-on-invalid-code' });
                    continue;
                }
                if (seen.has(code)) {
                    issues.push({ message: `dependsOn contains duplicate code "${code}"`, reason: 'depends-on-duplicate-code' });
                }
                seen.add(code);
            }
        }

        // Adapter validation
        this.validateAdapters(definition, issues, warnings);

        // Capabilities validation
        this.validateCapabilities(definition, issues);

        // Context validation
        this.validateContext(definition, issues);

        return { isValid: issues.length === 0, issues, warnings, level };
    }

    /**
     * Full async validation including dependency checks
     * Use for save/publish operations
     */
    async validateAsync(definition: PipelineDefinition, options: ValidationOptions = {}): Promise<DefinitionValidationResult> {
        const level = options.level ?? ValidationLevel.FULL;

        // Start with sync validation
        const result = this.validateSync(definition, { ...options, level: ValidationLevel.SEMANTIC });

        if (level !== ValidationLevel.FULL || options.skipDependencyCheck) {
            return { ...result, level };
        }

        // Async dependency existence checks
        if (definition.dependsOn && Array.isArray(definition.dependsOn)) {
            const seen = new Set<string>(definition.dependsOn.filter(c => c && typeof c === 'string'));
            try {
                const repo = this.connection.getRepository(Pipeline);
                for (const code of seen) {
                    const found = await repo.findOne({ where: { code } } as any);
                    if (!found) {
                        result.issues.push({
                            message: `dependsOn references unknown pipeline code "${code}"`,
                            reason: 'depends-on-unknown-code',
                        });
                    }
                }
            } catch (e: any) {
                // Log but don't fail validation on database errors
                Logger.warn(`Failed to validate pipeline dependencies: ${e.message}`, 'DataHub');
                result.warnings.push({
                    message: 'Could not verify pipeline dependencies',
                    reason: 'depends-on-check-failed',
                });
            }
        }

        return {
            isValid: result.issues.length === 0,
            issues: result.issues,
            warnings: result.warnings,
            level,
        };
    }

    /**
     * Legacy synchronous validate method - throws on error
     * @deprecated Use validateSync or validateAsync instead
     */
    validate(definition: PipelineDefinition): void {
        const result = this.validateSync(definition);
        if (!result.isValid) {
            throw new PipelineDefinitionError(result.issues);
        }
    }

    private validateAdapters(
        definition: PipelineDefinition,
        issues: PipelineDefinitionIssue[],
        warnings: PipelineDefinitionIssue[],
    ): void {
        for (const step of definition.steps) {
            const type = step.type;
            const cfg: any = step.config ?? {};
            const adapterType = this.adapterTypeFor(type);
            if (!adapterType) {
                continue;
            }

            // TRANSFORM steps use operators array, not adapterCode
            if (type === StepType.TRANSFORM) {
                this.validateTransformOperators(step.key, cfg, definition, issues);
                continue;
            }

            const adapterCode: string | undefined = cfg.adapterCode;
            if (!adapterCode || typeof adapterCode !== 'string') {
                issues.push({
                    message: `Step "${step.key}": missing adapterCode for ${type}`,
                    stepKey: step.key,
                    reason: 'missing-adapter-code',
                });
                continue;
            }
            const adapter = this.registry.find(adapterType, adapterCode);
            if (!adapter) {
                issues.push({
                    message: `Step "${step.key}": unknown adapter "${adapterCode}" for ${type}`,
                    stepKey: step.key,
                    reason: 'unknown-adapter',
                });
                continue;
            }

            // Adapter permission requirements are auto-inferred at runtime.
            // No need to require explicit declaration in capabilities.requires.
            // The permissions needed by adapters are known from their definitions
            // and will be checked when the pipeline is executed.

            // Streaming guardrail: only pure operators allowed in stream mode
            if (definition.context?.runMode === 'stream' && adapterType === 'operator') {
                if ((adapter as any).pure !== true) {
                    issues.push({
                        message: `Step "${step.key}": operator "${adapterCode}" is not stream-safe (pure=false)`,
                        stepKey: step.key,
                        reason: 'operator-not-pure',
                    });
                }
            }

            // Validate adapter fields
            this.validateAdapterFields(step.key, cfg, adapter, issues);

            // Extra semantic validation for GraphQL extractor
            if (adapterType === 'extractor' && adapterCode === 'graphql') {
                this.validateGraphQLExtractor(step.key, cfg, issues);
            }
        }
    }

    private validateAdapterFields(
        stepKey: string,
        cfg: any,
        adapter: any,
        issues: PipelineDefinitionIssue[],
    ): void {
        for (const field of adapter.schema.fields) {
            const v = cfg[field.key];
            if (field.required && (v === undefined || v === null || v === '')) {
                issues.push({
                    message: `Step "${stepKey}": missing required field "${field.key}"`,
                    stepKey,
                    field: field.key,
                    reason: 'missing-required-field',
                });
            }
            if (v !== undefined && v !== null) {
                const t = String(field.type);
                if (t === 'string' && typeof v !== 'string') {
                    issues.push({
                        message: `Step "${stepKey}": field "${field.key}" must be string`,
                        stepKey,
                        field: field.key,
                        reason: 'invalid-field-type',
                    });
                }
                if (t === 'number' && typeof v !== 'number') {
                    issues.push({
                        message: `Step "${stepKey}": field "${field.key}" must be number`,
                        stepKey,
                        field: field.key,
                        reason: 'invalid-field-type',
                    });
                }
                if (t === 'boolean' && typeof v !== 'boolean') {
                    issues.push({
                        message: `Step "${stepKey}": field "${field.key}" must be boolean`,
                        stepKey,
                        field: field.key,
                        reason: 'invalid-field-type',
                    });
                }
                if (t === 'json' && typeof v !== 'object') {
                    issues.push({
                        message: `Step "${stepKey}": field "${field.key}" must be JSON`,
                        stepKey,
                        field: field.key,
                        reason: 'invalid-field-type',
                    });
                }
                if (t === 'select') {
                    if (typeof v !== 'string') {
                        issues.push({
                            message: `Step "${stepKey}": field "${field.key}" must be a valid option`,
                            stepKey,
                            field: field.key,
                            reason: 'invalid-select-option',
                        });
                    } else if (Array.isArray((field as any).options) && (field as any).options.length > 0) {
                        const allowed = new Set<string>(
                            (field as any).options.map((o: any) => String(o?.value ?? '')),
                        );
                        if (!allowed.has(String(v))) {
                            issues.push({
                                message: `Step "${stepKey}": field "${field.key}" must be one of [${Array.from(allowed).join(', ')}]`,
                                stepKey,
                                field: field.key,
                                reason: 'invalid-select-option',
                            });
                        }
                    }
                }
            }
        }
    }

    private validateGraphQLExtractor(
        stepKey: string,
        cfg: any,
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
                // Ignore regex errors
            }
            const provided =
                cfg.variables && typeof cfg.variables === 'object'
                    ? new Set<string>(Object.keys(cfg.variables))
                    : new Set<string>();
            const missingVars = Array.from(vars).filter(v => !provided.has(v));
            if (missingVars.length) {
                issues.push({
                    message: `Step "${stepKey}": GraphQL variables missing keys: ${missingVars.join(', ')}`,
                    stepKey,
                    reason: 'graphql-missing-variable',
                });
            }
        }
    }

    private validateCapabilities(definition: PipelineDefinition, issues: PipelineDefinitionIssue[]): void {
        if (!definition.capabilities || typeof definition.capabilities !== 'object') {
            return;
        }

        const caps: any = definition.capabilities;

        if (caps.writes) {
            if (!Array.isArray(caps.writes)) {
                issues.push({ message: 'capabilities.writes must be an array', reason: 'capabilities-invalid' });
            } else {
                const allowed = new Set(['catalog', 'customers', 'orders', 'promotions', 'inventory', 'custom']);
                for (const w of caps.writes) {
                    if (typeof w !== 'string' || !allowed.has(w)) {
                        issues.push({
                            message: `capabilities.writes contains invalid domain: ${String(w)}`,
                            reason: 'capabilities-invalid-domain',
                        });
                    }
                }
            }
        }

        if (caps.requires && !Array.isArray(caps.requires)) {
            issues.push({
                message: 'capabilities.requires must be an array of permission names',
                reason: 'capabilities-invalid',
            });
        }

        if (caps.streamSafe != null && typeof caps.streamSafe !== 'boolean') {
            issues.push({
                message: 'capabilities.streamSafe must be a boolean',
                reason: 'capabilities-invalid',
            });
        }
    }

    private validateContext(definition: PipelineDefinition, issues: PipelineDefinitionIssue[]): void {
        if (!definition.context) {
            return;
        }

        // Streaming semantics validation
        if (definition.context.lateEvents) {
            const le: any = definition.context.lateEvents;
            if (le.policy !== 'drop' && le.policy !== 'buffer') {
                issues.push({
                    message: 'context.lateEvents.policy must be drop|buffer',
                    reason: 'context-invalid',
                });
            }
            if (le.policy === 'buffer' && (typeof le.bufferMs !== 'number' || le.bufferMs <= 0)) {
                issues.push({
                    message: 'context.lateEvents.bufferMs must be a positive number when policy=buffer',
                    reason: 'context-invalid',
                });
            }
        }

        if (
            definition.context.watermarkMs != null &&
            (typeof definition.context.watermarkMs !== 'number' || definition.context.watermarkMs < 0)
        ) {
            issues.push({
                message: 'context.watermarkMs must be a non-negative number',
                reason: 'context-invalid',
            });
        }
    }

    private validateTransformOperators(
        stepKey: string,
        cfg: any,
        definition: PipelineDefinition,
        issues: PipelineDefinitionIssue[],
    ): void {
        const operators = cfg.operators;
        if (!operators || !Array.isArray(operators)) {
            issues.push({
                message: `Step "${stepKey}": TRANSFORM step requires operators array`,
                stepKey,
                reason: 'missing-operators',
            });
            return;
        }

        if (operators.length === 0) {
            issues.push({
                message: `Step "${stepKey}": operators array is empty`,
                stepKey,
                reason: 'empty-operators',
            });
            return;
        }

        for (let i = 0; i < operators.length; i++) {
            const op = operators[i];
            if (!op || typeof op !== 'object') {
                issues.push({
                    message: `Step "${stepKey}": operator ${i} is not a valid object`,
                    stepKey,
                    reason: 'invalid-operator',
                });
                continue;
            }

            const opCode: string | undefined = op.op;
            if (!opCode || typeof opCode !== 'string') {
                issues.push({
                    message: `Step "${stepKey}": operator ${i} missing "op" field`,
                    stepKey,
                    reason: 'missing-operator-code',
                });
                continue;
            }

            const adapter = this.registry.find('operator', opCode);
            if (!adapter) {
                issues.push({
                    message: `Step "${stepKey}": unknown operator "${opCode}"`,
                    stepKey,
                    reason: 'unknown-operator',
                });
                continue;
            }

            // Streaming guardrail: only pure operators allowed in stream mode
            if (definition.context?.runMode === 'stream') {
                if ((adapter as any).pure !== true) {
                    issues.push({
                        message: `Step "${stepKey}": operator "${opCode}" is not stream-safe (pure=false)`,
                        stepKey,
                        reason: 'operator-not-pure',
                    });
                }
            }
        }
    }

    /**
     * Lookup map from StepType to adapter type
     * This map provides better extensibility than switch statements
     * New step types can be added to this map without modifying control flow
     */
    private static readonly STEP_TYPE_TO_ADAPTER_TYPE: Partial<Record<StepType, 'extractor' | 'operator' | 'loader' | 'exporter' | 'feed' | 'enricher' | 'sink'>> = {
        [StepType.EXTRACT]: 'extractor',
        [StepType.TRANSFORM]: 'operator',
        [StepType.LOAD]: 'loader',
        [StepType.EXPORT]: 'exporter',
        [StepType.FEED]: 'feed',
        [StepType.ENRICH]: 'enricher',
        [StepType.SINK]: 'sink',
        // StepType.TRIGGER, StepType.VALIDATE, StepType.ROUTE intentionally excluded (no adapter)
    };

    private adapterTypeFor(
        stepType: StepType,
    ): 'extractor' | 'operator' | 'loader' | 'exporter' | 'feed' | 'enricher' | 'sink' | null {
        return DefinitionValidationService.STEP_TYPE_TO_ADAPTER_TYPE[stepType] ?? null;
    }
}
