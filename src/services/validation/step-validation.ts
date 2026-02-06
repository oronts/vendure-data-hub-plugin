import { RunMode } from '../../constants/enums';
import { JsonObject, PipelineDefinition } from '../../types/index';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { AdapterDefinition } from '../../sdk/types';
import { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';

// ============================================================================
// Type Definitions
// ============================================================================

export interface OperatorConfig {
    op: string;
    params?: JsonObject;
}

export interface TransformStepConfig {
    operators?: unknown[];
    adapterCode?: string;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isOperatorConfig(value: unknown): value is OperatorConfig {
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

function hasStreamSafetyInfo(
    adapter: AdapterDefinition | undefined,
): adapter is AdapterDefinition & { pure: boolean } {
    return adapter !== undefined && typeof adapter.pure === 'boolean';
}

// ============================================================================
// Validation Functions
// ============================================================================

export function validateTransformOperators(
    stepKey: string,
    cfg: TransformStepConfig,
    definition: PipelineDefinition,
    registry: DataHubRegistryService,
    issues: PipelineDefinitionIssue[],
): void {
    const operators = cfg.operators;
    if (!validateOperatorChain(stepKey, operators, issues)) {
        return;
    }

    for (let i = 0; i < operators.length; i++) {
        validateOperatorParams(stepKey, operators[i], i, definition, registry, issues);
    }
}

export function validateOperatorChain(
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

export function validateOperatorParams(
    stepKey: string,
    op: unknown,
    index: number,
    definition: PipelineDefinition,
    registry: DataHubRegistryService,
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

    const adapter = registry.find('operator', opCode);
    if (!adapter) {
        issues.push({
            message: `Step "${stepKey}": unknown operator "${opCode}"`,
            stepKey,
            errorCode: 'unknown-operator',
        });
        return;
    }

    validateOperatorStreamSafety(stepKey, opCode, adapter, definition, issues);
}

export function validateOperatorStreamSafety(
    stepKey: string,
    opCode: string,
    adapter: AdapterDefinition,
    definition: PipelineDefinition,
    issues: PipelineDefinitionIssue[],
): void {
    if (definition.context?.runMode !== RunMode.STREAM) {
        return;
    }

    if (!hasStreamSafetyInfo(adapter) || adapter.pure !== true) {
        issues.push({
            message: `Step "${stepKey}": operator "${opCode}" is not stream-safe (pure=false)`,
            stepKey,
            errorCode: 'operator-not-pure',
        });
    }
}
