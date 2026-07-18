/**
 * Adapter configuration validation for pipeline definitions.
 * Handles validation of adapter codes, field schemas, and connectivity requirements.
 */

import {
    AdapterType as AdapterTypeEnum,
    StepType as StepTypeEnum,
} from '../../constants/enums';
import { GRAPHQL_EXTRACTOR_CODE } from '../../extractors/graphql/schema';
import type { JsonValue, StepType } from '../../types/index';
import type { DataHubRegistryService } from '../../sdk/registry.service';
import type { AdapterDefinition, StepConfigSchema, StepConfigSchemaField, SelectOption } from '../../sdk/types';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import type { AdapterType } from '../../../shared/types';
import { validateFieldConstraints } from './field-constraint-validation';
import { getNestedValue } from '../../../shared/utils/object-path';
import { assertCanonicalExtractorConfig } from '../../extractors/extractor-config.contract';
import { getErrorMessage } from '../../utils/error.utils';

export type { AdapterType } from '../../../shared/types';

export function addAdapterDeprecationWarning(
    stepKey: string,
    adapter: AdapterDefinition,
    warnings: PipelineDefinitionIssue[],
    usage = 'adapter',
): void {
    if (adapter.deprecated !== true) {
        return;
    }
    warnings.push({
        message: `Step "${stepKey}": ${usage} "${adapter.code}" is deprecated: ${adapter.deprecatedMessage}`,
        stepKey,
        errorCode: 'deprecated-adapter',
    });
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Step configuration with adapter code
 */
export interface AdapterStepConfig {
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

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates adapter code and returns the adapter definition if valid.
 */
export function validateAdapterConfig(
    stepKey: string,
    stepType: StepType,
    cfg: AdapterStepConfig,
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
 * Validates all fields in an adapter configuration against the schema.
 */
export function validateAdapterFields(
    stepKey: string,
    cfg: AdapterStepConfig,
    adapter: AdapterDefinition,
    issues: PipelineDefinitionIssue[],
): void {
    if (!hasValidSchema(adapter)) {
        return;
    }

    validateBuiltInAdapterFields(stepKey, cfg, adapter, issues);

    for (const field of adapter.schema.fields) {
        const fieldValue = getNestedValue(cfg, field.key) as JsonValue | undefined;
        validateRequiredFields(stepKey, field, fieldValue, issues);
        if (fieldValue != null) {
            const validType = validateFieldTypes(stepKey, field, fieldValue, issues);
            if (validType) {
                validateFieldMappings(stepKey, field, fieldValue, issues);
                validateFieldConstraints(stepKey, field, fieldValue, issues);
            }
        }
    }

    if (adapter.code === 'httpLookup') {
        validateHttpLookupConnectionContract(stepKey, cfg, issues);
    }
}

export function validateHttpLookupConnectionContract(
    stepKey: string,
    cfg: AdapterStepConfig,
    issues: PipelineDefinitionIssue[],
): void {
    const authenticationFields = [
        'bearerTokenSecretCode',
        'apiKeySecretCode',
        'basicAuthSecretCode',
    ] as const;
    const usesSecretAuthentication = authenticationFields.some(
        field => cfg[field] !== undefined,
    );
    if (!usesSecretAuthentication) return;
    if (
        typeof cfg.connectionCode === 'string'
        && cfg.connectionCode.trim().length > 0
        && cfg.connectionCode === cfg.connectionCode.trim()
    ) {
        return;
    }

    issues.push({
        message: `Step "${stepKey}": authenticated HTTP lookup requires connectionCode to bind credentials to an origin`,
        stepKey,
        field: 'connectionCode',
        errorCode: 'missing-http-lookup-connection',
    });
}

function validateBuiltInAdapterFields(
    stepKey: string,
    cfg: AdapterStepConfig,
    adapter: AdapterDefinition & { schema: StepConfigSchema },
    issues: PipelineDefinitionIssue[],
): void {
    if (
        adapter.builtIn !== true
        || (adapter.type !== AdapterTypeEnum.LOADER && adapter.type !== AdapterTypeEnum.OPERATOR)
    ) {
        return;
    }

    const allowedFields = new Set<string>(['adapterCode']);
    for (const field of adapter.schema.fields) {
        allowedFields.add(field.key.split('.')[0]);
    }

    for (const field of Object.keys(cfg)) {
        if (allowedFields.has(field)) continue;
        issues.push({
            message: `Step "${stepKey}": field "${field}" is not supported by built-in ${adapter.type.toLowerCase()} "${adapter.code}"`,
            stepKey,
            field,
            errorCode: 'unknown-adapter-field',
        });
    }
}

export function validateExtractorConfigContract(
    stepKey: string,
    adapterCode: string,
    cfg: AdapterStepConfig,
    issues: PipelineDefinitionIssue[],
): void {
    if (adapterCode !== 'httpApi' && adapterCode !== GRAPHQL_EXTRACTOR_CODE) return;

    try {
        assertCanonicalExtractorConfig(adapterCode, cfg);
    } catch (error) {
        issues.push({
            message: `Step "${stepKey}": ${getErrorMessage(error)}`,
            stepKey,
            errorCode: 'invalid-extractor-config-contract',
        });
    }
}

const BUILT_IN_SINK_CODES = new Set([
    'meilisearch',
    'elasticsearch',
    'opensearch',
    'algolia',
    'typesense',
    'queueProducer',
    'webhook',
]);

const REMOVED_SINK_FIELDS = [
    'sinkType',
    'hosts',
    'indexPrefix',
    'pipeline',
    'refresh',
    'applicationId',
    'routing',
    'bulkSize',
    'flushIntervalMs',
    'fieldMapping',
    'deleteOnMissing',
    'upsert',
    'basicSecretCode',
] as const;

export function validateSinkConfigContract(
    stepKey: string,
    adapterCode: string,
    cfg: AdapterStepConfig,
    issues: PipelineDefinitionIssue[],
): void {
    if (!BUILT_IN_SINK_CODES.has(adapterCode)) return;

    const unsupportedFields: string[] = REMOVED_SINK_FIELDS.filter(
        field => cfg[field] !== undefined,
    );
    if ((adapterCode === 'elasticsearch' || adapterCode === 'opensearch') && cfg.host !== undefined) {
        unsupportedFields.push('host');
    }
    if (adapterCode !== 'queueProducer' && cfg.connectionCode !== undefined) {
        unsupportedFields.push('connectionCode');
    }

    for (const field of unsupportedFields) {
        issues.push({
            message: `Step "${stepKey}": sink field "${field}" is not supported`,
            stepKey,
            field,
            errorCode: 'unsupported-sink-field',
        });
    }
}

export function validateLoaderConfigContract(
    stepKey: string,
    adapterCode: string,
    cfg: AdapterStepConfig,
    issues: PipelineDefinitionIssue[],
): void {
    if (adapterCode !== 'orderTransition') return;

    const hasStaticState = typeof cfg.state === 'string' && cfg.state.trim().length > 0;
    const hasStateField = typeof cfg.stateField === 'string' && cfg.stateField.trim().length > 0;
    if (hasStaticState || hasStateField) return;

    issues.push({
        message: `Step "${stepKey}": orderTransition requires "state" or "stateField"`,
        stepKey,
        field: 'state',
        errorCode: 'missing-order-transition-state',
    });
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
    const emptyStringIsValid = value === '' && field.defaultValue === '';
    if (field.required && !emptyStringIsValid && (value === undefined || value === null || value === '')) {
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
): boolean {
    const fieldType = String(field.type).toLowerCase();
    const typeValidators: Record<string, () => boolean> = {
        string: () => typeof value === 'string',
        number: () => typeof value === 'number' && Number.isFinite(value),
        boolean: () => typeof value === 'boolean',
        json: () => isJsonValue(value),
    };

    const validator = typeValidators[fieldType];
    if (validator && !validator()) {
        issues.push({
            message: `Step "${stepKey}": field "${field.key}" must be ${fieldType === 'json' ? 'JSON' : fieldType}`,
            stepKey,
            field: field.key,
            errorCode: 'invalid-field-type',
        });
        return false;
    }
    return true;
}

function isJsonValue(root: unknown): boolean {
    const pending: Array<{ value: unknown; exiting: boolean }> = [{
        value: root,
        exiting: false,
    }];
    const activePath = new Set<object>();

    while (pending.length > 0) {
        const frame = pending.pop();
        if (!frame) continue;
        const { value } = frame;
        if (frame.exiting) {
            activePath.delete(value as object);
            continue;
        }
        if (
            value === null
            || typeof value === 'string'
            || typeof value === 'boolean'
        ) {
            continue;
        }
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) return false;
            continue;
        }
        if (typeof value !== 'object' || activePath.has(value)) {
            return false;
        }

        const prototype = Object.getPrototypeOf(value);
        if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
            return false;
        }
        activePath.add(value);
        pending.push({ value, exiting: true });
        const children = Object.values(value);
        for (let index = children.length - 1; index >= 0; index--) {
            pending.push({ value: children[index], exiting: false });
        }
    }

    return true;
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
    cfg: AdapterStepConfig,
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
export function isUsingBuiltInEnrichment(stepType: StepType, cfg: AdapterStepConfig): boolean {
    if (stepType !== StepTypeEnum.ENRICH) {
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
    return adapterType === AdapterTypeEnum.EXTRACTOR && adapterCode === GRAPHQL_EXTRACTOR_CODE;
}
