import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { CACHE_TIMES } from '../../constants';
import {
    buildStepMappings,
    FALLBACK_STEP_MAPPINGS,
} from '../../constants/step-mappings';
import type { StepMappings } from '../../constants/step-mappings';
import type { StepConfig } from '../../constants/steps';
import type { StepType } from '../../../shared/types';
import type { WizardStrategyMapping } from '../../types/wizard';
import { createQueryKeys } from '../../utils/query-key-factory';
import { normalizeWizardStrategyMappings } from '../../utils/wizard-strategies';
import { configOptionsDocument } from './config-options-document';
import {
    buildStepConfigRecord,
    normalizeConfigOptions,
} from './config-options-normalization';
import type {
    AdapterCodeMapping,
    AdapterCodeMappingField,
    ComparisonOperatorOption,
    ConfigOptionValue,
    ConfigOptionValueField,
    ConnectionSchema,
    DestinationSchema,
    FileFormatOption,
    HookStageCategoryConfig,
    HookStageConfig,
    TypedOptionValue,
} from './config-options.types';

const base = createQueryKeys('config-options');
const configOptionKeys = {
    ...base,
    options: () => [...base.all, 'options'] as const,
};

export function useConfigOptions() {
    return useQuery({
        queryKey: configOptionKeys.options(),
        queryFn: () => api.query(configOptionsDocument)
            .then(response => normalizeConfigOptions(
                response.dataHubConfigOptions,
            )),
        staleTime: CACHE_TIMES.ADAPTER_CATALOG,
    });
}

export function useOptionValues(
    field: ConfigOptionValueField,
): { options: ConfigOptionValue[]; isLoading: boolean } {
    const { data, isLoading } = useConfigOptions();
    const options = useMemo(
        () => (data?.[field] ?? []).filter(option => option.value !== ''),
        [data, field],
    );
    return { options, isLoading };
}

export function useFileFormats(): {
    options: FileFormatOption[];
    isLoading: boolean;
} {
    const { data, isLoading } = useConfigOptions();
    const options = useMemo(
        () => (data?.fileFormats ?? []).filter(format => format.parseable),
        [data?.fileFormats],
    );
    return { options, isLoading };
}

export function useAdapterCodeMappings(
    field: AdapterCodeMappingField,
): { mappings: AdapterCodeMapping[]; isLoading: boolean } {
    const { data, isLoading } = useConfigOptions();
    const mappings = useMemo(
        () => data?.[field] ?? [],
        [data, field],
    );
    return { mappings, isLoading };
}

export function useConnectionSchemas(): {
    schemas: ConnectionSchema[];
    isLoading: boolean;
} {
    const { data, isLoading } = useConfigOptions();
    return {
        schemas: data?.connectionSchemas ?? [],
        isLoading,
    };
}

export function useDestinationSchemas(): {
    schemas: DestinationSchema[];
    isLoading: boolean;
} {
    const { data, isLoading } = useConfigOptions();
    return {
        schemas: data?.destinationSchemas ?? [],
        isLoading,
    };
}

export interface UseStepConfigsResult {
    stepConfigs: Record<StepType, StepConfig>;
    getStepConfig: (type: StepType | string) => StepConfig | undefined;
    isLoading: boolean;
}

export function useStepConfigs(): UseStepConfigsResult {
    const { data, isLoading } = useConfigOptions();
    const stepConfigs = useMemo(
        () => buildStepConfigRecord(data?.stepTypes),
        [data?.stepTypes],
    );
    const getStepConfig = useCallback(
        (type: StepType | string): StepConfig | undefined =>
            stepConfigs[String(type).toUpperCase() as StepType],
        [stepConfigs],
    );

    return { stepConfigs, getStepConfig, isLoading };
}

export function useStepMappings(): {
    mappings: StepMappings;
    isLoading: boolean;
} {
    const { stepConfigs, isLoading } = useStepConfigs();
    const mappings = useMemo(
        () => isLoading
            ? FALLBACK_STEP_MAPPINGS
            : buildStepMappings(stepConfigs),
        [stepConfigs, isLoading],
    );
    return { mappings, isLoading };
}

export function useHookStages(): {
    hookStages: HookStageConfig[];
    isLoading: boolean;
} {
    const { data, isLoading } = useConfigOptions();
    return { hookStages: data?.hookStages ?? [], isLoading };
}

export function useHookStageCategories(): {
    categories: HookStageCategoryConfig[];
    isLoading: boolean;
} {
    const { data, isLoading } = useConfigOptions();
    const categories = useMemo(
        () => [...(data?.hookStageCategories ?? [])]
            .sort((left, right) => left.order - right.order),
        [data?.hookStageCategories],
    );
    return { categories, isLoading };
}

export function useComparisonOperators(): {
    operators: ComparisonOperatorOption[];
    isLoading: boolean;
} {
    const { data, isLoading } = useConfigOptions();
    return {
        operators: data?.comparisonOperators ?? [],
        isLoading,
    };
}

function useTypedOptionSchemas(
    field:
        | 'triggerTypes'
        | 'enrichmentSourceTypes'
        | 'approvalTypes'
        | 'validationRuleTypes',
): { schemas: TypedOptionValue[]; isLoading: boolean } {
    const { data, isLoading } = useConfigOptions();
    return { schemas: data?.[field] ?? [], isLoading };
}

export function useTriggerTypeSchemas() {
    return useTypedOptionSchemas('triggerTypes');
}

export function useEnrichmentSourceSchemas() {
    return useTypedOptionSchemas('enrichmentSourceTypes');
}

export function useApprovalTypeSchemas() {
    return useTypedOptionSchemas('approvalTypes');
}

export function useValidationRuleSchemas() {
    return useTypedOptionSchemas('validationRuleTypes');
}

export function useFieldTransformTypes() {
    return useOptionValues('fieldTransformTypes');
}

export function useWizardStrategyMappings(): {
    mappings: WizardStrategyMapping[];
    isLoading: boolean;
} {
    const { data, isLoading } = useConfigOptions();
    const mappings = useMemo(
        () => normalizeWizardStrategyMappings(
            data?.wizardStrategyMappings ?? [],
        ),
        [data?.wizardStrategyMappings],
    );
    return { mappings, isLoading };
}

export function useQueryTypeOptions() {
    return useOptionValues('queryTypeOptions');
}

export type {
    AdapterCodeMapping,
    ComparisonOperatorOption,
    ConfigOptionValue,
    ConfigOptionsData,
    ConnectionSchema,
    ConnectionSchemaField,
    DestinationSchema,
    FileFormatOption,
    HookStageCategoryConfig,
    HookStageConfig,
    StepTypeConfig,
    TypedOptionValue,
} from './config-options.types';
