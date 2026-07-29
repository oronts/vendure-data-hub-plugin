import type { Permission } from '@vendure/core';
import { AdapterType, StepType } from '../../constants/enums';
import { SHARED_STEP_TYPE_CONFIGS } from '../../../shared/constants/step-type-configs';
import type { AdapterDefinition } from '../../sdk/types';
import type {
    PipelineCapabilities,
    PipelineDefinition,
    PipelineStepDefinition,
} from '../../types';
import { getAdapterCode } from '../../types/step-configs';
import {
    UseDataHubConnectionPermission,
    UseDataHubSecretPermission,
} from '../../permissions';
import { collectResourceReferences } from '../config/resource-references';
import { clonePipelineDefinition } from './pipeline-policy';

export interface AdapterDefinitionRegistry {
    find(type: string, code: string): AdapterDefinition | undefined;
}

export interface PermissionContext {
    userHasPermissions(permissions: Permission[]): boolean;
}

const STEP_ADAPTER_TYPES = new Map(
    SHARED_STEP_TYPE_CONFIGS.flatMap(config => (
        config.adapterType === null
            ? []
            : [[config.type, config.adapterType as AdapterType] as const]
    )),
);

function getOperatorCodes(step: PipelineStepDefinition): string[] {
    if (
        step.type !== StepType.TRANSFORM ||
        typeof step.config !== 'object' ||
        step.config === null ||
        !('operators' in step.config) ||
        !Array.isArray(step.config.operators)
    ) {
        return [];
    }
    return step.config.operators.flatMap(operator => (
        typeof operator === 'object' &&
        operator !== null &&
        'op' in operator &&
        typeof operator.op === 'string' &&
        operator.op.length > 0
            ? [operator.op]
            : []
    ));
}

function addAdapterPermissions(
    required: Set<string>,
    registry: AdapterDefinitionRegistry,
    type: AdapterType,
    code: string,
): void {
    registry.find(type, code)?.requires?.forEach(permission => required.add(permission));
}

export function getRequiredPipelinePermissions(
    registry: AdapterDefinitionRegistry,
    definition: PipelineDefinition,
): string[] {
    const required = new Set(definition.capabilities?.requires ?? []);

    for (const step of definition.steps) {
        const adapterType = STEP_ADAPTER_TYPES.get(step.type);
        const adapterCode = getAdapterCode(step);
        if (adapterType && adapterCode) {
            addAdapterPermissions(required, registry, adapterType, adapterCode);
        }
        for (const operatorCode of getOperatorCodes(step)) {
            addAdapterPermissions(required, registry, AdapterType.OPERATOR, operatorCode);
        }
    }

    const references = collectResourceReferences(definition);
    if (references.connections.size > 0) {
        required.add(UseDataHubConnectionPermission.Permission);
        // Connection configuration may contain indirect Secret Codes that are not present in the definition.
        required.add(UseDataHubSecretPermission.Permission);
    }
    if (references.secrets.size > 0) {
        required.add(UseDataHubSecretPermission.Permission);
    }

    return [...required].sort();
}

export function getEffectivePipelineCapabilities(
    registry: AdapterDefinitionRegistry,
    definition: PipelineDefinition,
): Required<PipelineCapabilities> {
    return {
        requires: getRequiredPipelinePermissions(registry, definition),
        writes: [...new Set(definition.capabilities?.writes ?? [])].sort(),
    };
}

export function withEffectivePipelineCapabilities(
    registry: AdapterDefinitionRegistry,
    definition: PipelineDefinition,
): PipelineDefinition {
    const normalized = clonePipelineDefinition(definition);
    const capabilities = getEffectivePipelineCapabilities(registry, definition);
    normalized.capabilities = {
        ...normalized.capabilities,
        ...capabilities,
    };
    return normalized;
}

export function getMissingPipelinePermissions(
    registry: AdapterDefinitionRegistry,
    ctx: PermissionContext,
    definition: PipelineDefinition,
): string[] {
    if (ctx.userHasPermissions(['SuperAdmin' as Permission])) {
        return [];
    }
    return getRequiredPipelinePermissions(registry, definition)
        .filter(permission => !ctx.userHasPermissions([permission as Permission]));
}

export function assertPipelinePermissionsAllowed(
    registry: AdapterDefinitionRegistry,
    ctx: PermissionContext,
    definition: PipelineDefinition,
): void {
    const missing = getMissingPipelinePermissions(registry, ctx, definition);
    if (missing.length > 0) {
        throw new Error(`Missing required permissions for this pipeline: ${missing.join(', ')}`);
    }
}
