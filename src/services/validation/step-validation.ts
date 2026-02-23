import { AdapterType as AdapterTypeEnum } from '../../constants/enums';
import { PipelineDefinition } from '../../types/index';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { validateOperatorStreamSafety } from './adapter-validation';

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

    const adapter = registry.find(AdapterTypeEnum.OPERATOR, opCode);
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
