import { DEFAULT_STEP_CONFIGS } from '../../constants';
import type { StepConfig } from '../../constants/steps';
import type { StepType } from '../../../shared/types';
import type {
    ConfigOptionsData,
    RawConfigOptionsData,
    StepTypeConfig,
    TypedOptionValue,
} from './config-options.types';

function normalizeRecord(
    value: unknown,
    fieldName: string,
): Record<string, unknown> | null {
    if (value == null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${fieldName} must be an object`);
    }
    return Object.fromEntries(Object.entries(value));
}

export function normalizeStringMap(
    value: unknown,
    fieldName: string,
): Record<string, string> | null {
    const record = normalizeRecord(value, fieldName);
    if (!record) return null;

    const entries = Object.entries(record).map(([key, entry]) => {
        if (typeof entry !== 'string') {
            throw new Error(`${fieldName}.${key} must be a string`);
        }
        return [key, entry] as const;
    });
    return Object.fromEntries(entries);
}

function normalizeTypedOptions(
    options: RawConfigOptionsData['triggerTypes'],
    fieldName: string,
): TypedOptionValue[] {
    return options.map(option => ({
        ...option,
        defaultValues: normalizeRecord(
            option.defaultValues,
            `${fieldName}.${option.value}.defaultValues`,
        ),
        configKeyMap: normalizeStringMap(
            option.configKeyMap,
            `${fieldName}.${option.value}.configKeyMap`,
        ),
    }));
}

function normalizeDefaultedTypedOptions(
    options: RawConfigOptionsData['approvalTypes'],
    fieldName: string,
): TypedOptionValue[] {
    return options.map(option => ({
        ...option,
        defaultValues: normalizeRecord(
            option.defaultValues,
            `${fieldName}.${option.value}.defaultValues`,
        ),
    }));
}

export function normalizeConfigOptions(
    data: RawConfigOptionsData,
): ConfigOptionsData {
    return {
        ...data,
        stepTypes: data.stepTypes.map(stepType => ({
            ...stepType,
            adapterType: stepType.adapterType ?? null,
        })),
        triggerTypes: normalizeTypedOptions(data.triggerTypes, 'triggerTypes'),
        approvalTypes: normalizeDefaultedTypedOptions(
            data.approvalTypes,
            'approvalTypes',
        ),
        enrichmentSourceTypes: normalizeDefaultedTypedOptions(
            data.enrichmentSourceTypes,
            'enrichmentSourceTypes',
        ),
        validationRuleTypes: normalizeDefaultedTypedOptions(
            data.validationRuleTypes,
            'validationRuleTypes',
        ),
        destinationSchemas: data.destinationSchemas.map(destination => ({
            ...destination,
            fieldMapping: normalizeStringMap(
                destination.fieldMapping,
                `destinationSchemas.${destination.type}.fieldMapping`,
            ),
        })),
    };
}

function cloneStepConfig(config: StepConfig): StepConfig {
    return { ...config };
}

export function buildStepConfigRecord(
    stepTypes: readonly StepTypeConfig[] | null | undefined,
): Record<StepType, StepConfig> {
    const record = Object.fromEntries(
        Object.entries(DEFAULT_STEP_CONFIGS).map(([type, config]) => [
            type,
            cloneStepConfig(config),
        ]),
    ) as Record<StepType, StepConfig>;

    for (const stepType of stepTypes ?? []) {
        const type = stepType.type as StepType;
        if (!(type in record)) continue;
        record[type] = {
            type,
            label: stepType.label,
            description: stepType.description,
            icon: stepType.icon,
            color: stepType.color,
            bgColor: stepType.bgColor,
            borderColor: stepType.borderColor,
            inputs: stepType.inputs,
            outputs: stepType.outputs,
            adapterType: stepType.adapterType,
            nodeType: stepType.nodeType,
        };
    }
    return record;
}
