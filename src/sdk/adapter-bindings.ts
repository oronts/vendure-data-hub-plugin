import type {
    AdapterBinding,
    AdapterType,
    PipelineDefinition,
    PipelineStepDefinition,
} from '../../shared/types';
import { AdapterType as AdapterTypeEnum, StepType } from '../constants/enums';
import { STEP_TYPE_TO_ADAPTER_TYPE } from '../constants';
import type { DataHubRegistryService } from './registry.service';

const ADAPTER_STEP_TYPES = new Set([
    StepType.EXTRACT,
    StepType.ENRICH,
    StepType.LOAD,
    StepType.EXPORT,
    StepType.FEED,
    StepType.SINK,
]);

interface AdapterUsage {
    location: string;
    stepKey: string;
    type: AdapterType;
    code: string;
}

export interface AdapterBindingIssue {
    location?: string;
    stepKey?: string;
    message: string;
    errorCode: string;
}

function adapterCode(step: PipelineStepDefinition): string | undefined {
    if (typeof step.adapterCode === 'string' && step.adapterCode.trim() !== '') {
        return step.adapterCode;
    }
    const configured = step.config?.adapterCode;
    return typeof configured === 'string' && configured.trim() !== ''
        ? configured
        : undefined;
}

function transformUsages(step: PipelineStepDefinition): AdapterUsage[] {
    const directCode = adapterCode(step);
    if (directCode) {
        return [{
            location: `steps.${step.key}`,
            stepKey: step.key,
            type: AdapterTypeEnum.OPERATOR,
            code: directCode,
        }];
    }

    const operators = step.config?.operators;
    if (!Array.isArray(operators)) return [];

    return operators.flatMap((operator, index) => {
        if (typeof operator !== 'object' || operator === null) return [];
        const code = Reflect.get(operator, 'op');
        if (typeof code !== 'string' || code.trim() === '') return [];
        return [{
            location: `steps.${step.key}.operators.${index}`,
            stepKey: step.key,
            type: AdapterTypeEnum.OPERATOR,
            code,
        }];
    });
}

export function collectAdapterUsages(
    definition: PipelineDefinition,
): AdapterUsage[] {
    return definition.steps.flatMap(step => {
        if (step.type === StepType.TRANSFORM) {
            return transformUsages(step);
        }
        if (!ADAPTER_STEP_TYPES.has(step.type as StepType)) return [];

        const code = adapterCode(step);
        const type = STEP_TYPE_TO_ADAPTER_TYPE[step.type];
        if (!code || !type) return [];

        return [{
            location: `steps.${step.key}`,
            stepKey: step.key,
            type,
            code,
        }];
    });
}

export function withResolvedAdapterBindings(
    registry: DataHubRegistryService,
    definition: PipelineDefinition,
): PipelineDefinition {
    const bindings = collectAdapterUsages(definition).map(usage => {
        const adapter = registry.find(usage.type, usage.code);
        if (!adapter) {
            throw new Error(
                `Cannot bind unknown ${usage.type} adapter '${usage.code}' at ${usage.location}`,
            );
        }
        if (!adapter.version || adapter.apiVersion === undefined) {
            throw new Error(
                `Adapter '${usage.code}' at ${usage.location} has no executable version contract`,
            );
        }
        return {
            location: usage.location,
            type: usage.type,
            code: usage.code,
            version: adapter.version,
            apiVersion: adapter.apiVersion,
        } satisfies AdapterBinding;
    });

    return { ...definition, adapterBindings: bindings };
}

export function validateAdapterBindings(
    registry: DataHubRegistryService,
    definition: PipelineDefinition,
    required: boolean,
): AdapterBindingIssue[] {
    const usages = collectAdapterUsages(definition);
    const rawBindings: unknown = definition.adapterBindings;
    if (rawBindings === undefined) {
        return required && usages.length > 0
            ? [{
                message: 'Published pipeline definition is missing adapter bindings',
                errorCode: 'missing-adapter-bindings',
            }]
            : [];
    }
    if (!Array.isArray(rawBindings)) {
        return [{
            message: 'Pipeline adapterBindings must be an array',
            errorCode: 'invalid-adapter-bindings',
        }];
    }

    const issues: AdapterBindingIssue[] = [];
    const expectedByLocation = new Map(usages.map(usage => [usage.location, usage]));
    const seenLocations = new Set<string>();

    for (const value of rawBindings) {
        if (typeof value !== 'object' || value === null) {
            issues.push({
                message: 'Pipeline contains an invalid adapter binding',
                errorCode: 'invalid-adapter-binding',
            });
            continue;
        }
        const binding = value as Partial<AdapterBinding>;
        if (typeof binding.location !== 'string' || binding.location.trim() === '') {
            issues.push({
                message: 'Pipeline contains an adapter binding without a location',
                errorCode: 'invalid-adapter-binding',
            });
            continue;
        }
        if (seenLocations.has(binding.location)) {
            issues.push({
                location: binding.location,
                message: `Duplicate adapter binding at ${binding.location}`,
                errorCode: 'duplicate-adapter-binding',
            });
            continue;
        }
        seenLocations.add(binding.location);

        const usage = expectedByLocation.get(binding.location);
        if (!usage) {
            issues.push({
                location: binding.location,
                message: `Unexpected adapter binding at ${binding.location}`,
                errorCode: 'unexpected-adapter-binding',
            });
            continue;
        }
        if (binding.type !== usage.type || binding.code !== usage.code) {
            issues.push({
                location: binding.location,
                stepKey: usage.stepKey,
                message: `Adapter binding at ${binding.location} does not match ${usage.type} '${usage.code}'`,
                errorCode: 'adapter-binding-identity-mismatch',
            });
            continue;
        }

        const adapter = registry.find(usage.type, usage.code);
        if (!adapter) {
            issues.push({
                location: binding.location,
                stepKey: usage.stepKey,
                message: `Bound adapter '${usage.code}' is not installed`,
                errorCode: 'bound-adapter-missing',
            });
            continue;
        }
        if (
            binding.version !== adapter.version
            || binding.apiVersion !== adapter.apiVersion
        ) {
            issues.push({
                location: binding.location,
                stepKey: usage.stepKey,
                message: `Bound adapter '${usage.code}' requires version ${String(binding.version)} and API ${String(binding.apiVersion)}; installed version is ${String(adapter.version)} with API ${String(adapter.apiVersion)}`,
                errorCode: 'adapter-binding-version-mismatch',
            });
        }
    }

    for (const usage of usages) {
        if (!seenLocations.has(usage.location)) {
            issues.push({
                location: usage.location,
                stepKey: usage.stepKey,
                message: `Missing adapter binding for ${usage.type} '${usage.code}' at ${usage.location}`,
                errorCode: 'missing-adapter-binding',
            });
        }
    }
    return issues;
}
