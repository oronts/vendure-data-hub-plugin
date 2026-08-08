import { AdapterType as AdapterTypeEnum } from '../../constants/enums';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import type { AdapterDefinition } from '../../sdk/types';
import {
    addAdapterDeprecationWarning,
    validateAdapterFields,
} from './adapter-validation';

// ============================================================================
// Type Definitions
// ============================================================================

export interface OperatorConfig {
    op: string;
    args?: Record<string, unknown>;
}

export interface TransformStepConfig {
    operators?: unknown[];
    adapterCode?: string;
    [key: string]: unknown;
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
    // args, if present, must be an object (not array)
    if (cfg.args !== undefined) {
        if (typeof cfg.args !== 'object' || cfg.args === null || Array.isArray(cfg.args)) {
            return false;
        }
    }
    return true;
}

// ============================================================================
// Validation Functions
// ============================================================================

export function validateTransformOperators(
    stepKey: string,
    cfg: TransformStepConfig,
    registry: DataHubRegistryService,
    issues: PipelineDefinitionIssue[],
    warnings: PipelineDefinitionIssue[],
): void {
    const operators = cfg.operators;
    if (operators !== undefined && !Array.isArray(operators)) {
        validateOperatorChain(stepKey, operators, issues);
        return;
    }

    if (Array.isArray(operators) && operators.length > 0) {
        for (let i = 0; i < operators.length; i++) {
            validateOperatorParams(stepKey, operators[i], i, registry, issues, warnings);
        }
        return;
    }

    if (typeof cfg.adapterCode === 'string' && cfg.adapterCode.trim() !== '') {
        const adapter = validateOperatorCode(
            stepKey,
            cfg.adapterCode,
            registry,
            issues,
            warnings,
        );
        if (adapter) {
            validateAdapterFields(stepKey, cfg, adapter, issues);
        }
        return;
    }

    validateOperatorChain(stepKey, operators, issues);
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
    registry: DataHubRegistryService,
    issues: PipelineDefinitionIssue[],
    warnings: PipelineDefinitionIssue[] = [],
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

    const adapter = validateOperatorCode(
        stepKey,
        opCode,
        registry,
        issues,
        warnings,
    );
    if (adapter) {
        validateAdapterFields(stepKey, op.args ?? {}, adapter, issues);
    }
}

function validateOperatorCode(
    stepKey: string,
    opCode: string,
    registry: DataHubRegistryService,
    issues: PipelineDefinitionIssue[],
    warnings: PipelineDefinitionIssue[],
): AdapterDefinition | undefined {
    const adapter = registry.find(AdapterTypeEnum.OPERATOR, opCode);
    if (!adapter) {
        issues.push({
            message: `Step "${stepKey}": unknown operator "${opCode}"`,
            stepKey,
            errorCode: 'unknown-operator',
        });
        return undefined;
    }
    addAdapterDeprecationWarning(stepKey, adapter, warnings, 'operator');
    return adapter;
}
