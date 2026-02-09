/**
 * Adapter configuration validation for pipeline definitions.
 * Handles validation of adapter codes, field schemas, and connectivity requirements.
 */

import { RunMode } from '../../constants/enums';
import { EXTRACTOR_CODE } from '../../constants/adapters';
import { JsonValue, PipelineDefinition, StepType } from '../../types/index';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { AdapterDefinition, StepConfigSchema, StepConfigSchemaField, SelectOption } from '../../sdk/types';
import { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { AdapterType } from '../../../shared/types';

export type { AdapterType } from '../../../shared/types';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Step configuration with adapter code
 */
export interface StepConfig {
    adapterCode?: string;
    query?: string;
    variables?: Record<string, JsonValue>;
    [key: string]: unknown;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if adapter has a valid schema
 */
export function hasValidSchema(
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
export function isFieldWithOptions(
    field: StepConfigSchemaField,
): field is StepConfigSchemaField & { options: readonly SelectOption[] } {
    return Array.isArray(field.options) && field.options.length > 0;
}

/**
 * Type guard to check if adapter has pure property
 */
export function hasStreamSafetyInfo(
    adapter: AdapterDefinition | undefined,
): adapter is AdapterDefinition & { pure: boolean } {
    return adapter !== undefined && typeof adapter.pure === 'boolean';
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates adapter code and returns the adapter definition if valid.
 */
export function validateAdapterConfig(
    stepKey: string,
    stepType: StepType,
    cfg: StepConfig,
    adapterType: AdapterType,
    registry: DataHubRegistryService,
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

    const adapter = registry.find(adapterType, adapterCode);
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

/**
 * Validates adapter connectivity and stream safety requirements.
 */
export function validateAdapterConnectivity(
    stepKey: string,
    adapterCode: string,
    adapterType: AdapterType,
    adapter: AdapterDefinition,
    definition: PipelineDefinition,
    issues: PipelineDefinitionIssue[],
): void {
    if (definition.context?.runMode === RunMode.STREAM && adapterType === 'OPERATOR') {
        if (!hasStreamSafetyInfo(adapter) || adapter.pure !== true) {
            issues.push({
                message: `Step "${stepKey}": operator "${adapterCode}" is not stream-safe (pure=false)`,
                stepKey,
                errorCode: 'operator-not-pure',
            });
        }
    }
}

/**
 * Validates all fields in an adapter configuration against the schema.
 */
export function validateAdapterFields(
    stepKey: string,
    cfg: StepConfig,
    adapter: AdapterDefinition,
    issues: PipelineDefinitionIssue[],
): void {
    if (!hasValidSchema(adapter)) {
        return;
    }

    for (const field of adapter.schema.fields) {
        const fieldValue = cfg[field.key] as JsonValue | undefined;
        validateRequiredFields(stepKey, field, fieldValue, issues);
        if (fieldValue !== undefined && fieldValue !== null) {
            validateFieldTypes(stepKey, field, fieldValue, issues);
            validateFieldMappings(stepKey, field, fieldValue, issues);
        }
    }
}

/**
 * Validates that required fields are present.
 */
export function validateRequiredFields(
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

/**
 * Validates field types match the expected schema type.
 */
export function validateFieldTypes(
    stepKey: string,
    field: StepConfigSchemaField,
    value: JsonValue,
    issues: PipelineDefinitionIssue[],
): void {
    const fieldType = String(field.type).toLowerCase();
    const typeValidators: Record<string, () => boolean> = {
        string: () => typeof value === 'string',
        number: () => typeof value === 'number',
        boolean: () => typeof value === 'boolean',
        json: () => typeof value === 'object',
    };

    const validator = typeValidators[fieldType];
    if (validator && !validator()) {
        issues.push({
            message: `Step "${stepKey}": field "${field.key}" must be ${fieldType === 'json' ? 'JSON' : fieldType}`,
            stepKey,
            field: field.key,
            errorCode: 'invalid-field-type',
        });
    }
}

/**
 * Validates field values against allowed select options.
 */
export function validateFieldMappings(
    stepKey: string,
    field: StepConfigSchemaField,
    value: JsonValue,
    issues: PipelineDefinitionIssue[],
): void {
    const fieldType = String(field.type).toLowerCase();
    if (fieldType !== 'select') {
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

/**
 * Validates GraphQL extractor configuration including query variables.
 */
export function validateGraphQLExtractor(
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

/**
 * Checks if a step type requires an adapter and returns true if built-in config is used.
 */
export function isUsingBuiltInEnrichment(stepType: StepType, cfg: StepConfig): boolean {
    if (stepType !== 'ENRICH') {
        return false;
    }
    const enrichConfig = cfg as { adapterCode?: string; defaults?: unknown; set?: unknown; computed?: unknown; sourceType?: string };
    const hasBuiltInConfig = enrichConfig.defaults || enrichConfig.set || enrichConfig.computed || enrichConfig.sourceType;
    return !enrichConfig.adapterCode && !!hasBuiltInConfig;
}

/**
 * Checks if this is a GraphQL extractor step.
 */
export function isGraphQLExtractor(adapterType: AdapterType, adapterCode: string): boolean {
    return adapterType === 'EXTRACTOR' && adapterCode === EXTRACTOR_CODE.GRAPHQL;
}
