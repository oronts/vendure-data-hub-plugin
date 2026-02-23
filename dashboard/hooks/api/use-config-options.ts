import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createQueryKeys } from '../../utils/query-key-factory';
import { CACHE_TIMES, DEFAULT_STEP_CONFIGS } from '../../constants';
import { buildStepMappings, FALLBACK_STEP_MAPPINGS } from '../../constants/step-mappings';
import type { StepMappings } from '../../constants/step-mappings';
import type { StepConfig } from '../../constants/steps';
import type { StepType } from '../../../shared/types';

const base = createQueryKeys('config-options');
const configOptionKeys = {
    ...base,
    options: () => [...base.all, 'options'] as const,
};

const configOptionsDocument = graphql(`
    query DataHubConfigOptionsApi {
        dataHubConfigOptions {
            stepTypes { type label description icon color bgColor borderColor inputs outputs category adapterType nodeType }
            loadStrategies { value label description icon }
            conflictStrategies { value label description icon }
            triggerTypes { value label description icon fields { key label type required placeholder defaultValue description options { value label } optionsRef } defaultValues configKeyMap wizardScopes }
            fileEncodings { value label description icon }
            csvDelimiters { value label description icon }
            compressionTypes { value label description icon }
            httpMethods { value label description icon }
            authTypes { value label description icon }
            destinationTypes { value label description icon }
            fileFormats { value label description icon color }
            cleanupStrategies { value label description icon }
            newRecordStrategies { value label description icon }
            validationModes { value label description icon }
            queueTypes { value label description icon }
            vendureEvents { value label description icon category }
            comparisonOperators { value label description valueType noValue example }
            approvalTypes { value label description icon fields { key label type required placeholder defaultValue description options { value label } } defaultValues }
            backoffStrategies { value label description icon }
            enrichmentSourceTypes { value label description icon fields { key label type required placeholder defaultValue description options { value label } } defaultValues }
            validationRuleTypes { value label description icon fields { key label type required placeholder defaultValue description options { value label } } defaultValues }
            exportAdapterCodes { value label adapterCode }
            feedAdapterCodes { value label adapterCode }
            connectionSchemas {
                type
                label
                fields { key label type required placeholder defaultValue description options { value label } }
                httpLike
            }
            destinationSchemas {
                type
                label
                configKey
                message
                fieldMapping
                fields { key label type required placeholder defaultValue description options { value label } }
            }
            hookStages { key label description icon category }
            hookStageCategories { key label color description gridClass order }
            logLevels { value label description icon }
            runModes { value label description icon }
            checkpointStrategies { value label description icon }
            parallelErrorPolicies { value label description icon }
            logPersistenceLevels { value label description icon }
            adapterTypes { value label description icon }
            runStatuses { value label description icon }
            fieldTransformTypes { value label description icon category }
            wizardStrategyMappings { wizardValue label loadStrategy conflictStrategy }
            queryTypeOptions { value label description icon }
            cronPresets { value label description icon }
            ackModes { value label description icon }
        }
    }
`);

export interface StepTypeConfig {
    type: string;
    label: string;
    description: string;
    icon: string;
    color: string;
    bgColor: string;
    borderColor: string;
    inputs: number;
    outputs: number;
    category: string;
    /** Backend adapter type for registry lookup (e.g. EXTRACTOR, OPERATOR, LOADER). Null for step types without adapters. */
    adapterType: string | null;
    /** Visual node type for the pipeline editor (e.g. source, transform, load). */
    nodeType: string;
}

export interface ConfigOptionValue {
    value: string;
    label: string;
    description?: string | null;
    /** Lucide icon name (kebab-case) for UI display, provided by backend */
    icon?: string | null;
    /** Hex color code for UI display (e.g. '#3b82f6'), provided by backend */
    color?: string | null;
    /** Optional category for UI grouping (e.g. Catalog, Orders) */
    category?: string | null;
}

export interface TypedOptionValue extends ConfigOptionValue {
    /** Form field definitions for this option type */
    fields: ConnectionSchemaField[];
    /** Default values when creating a new entry of this type */
    defaultValues?: Record<string, unknown> | null;
    /** Key map for converting wizard field names to pipeline config keys */
    configKeyMap?: Record<string, string> | null;
    /** Which wizard scopes this option appears in */
    wizardScopes?: string[] | null;
}

export interface ComparisonOperatorOption {
    value: string;
    label: string;
    description?: string | null;
    /** Value type hint for UI rendering: 'any' | 'number' | 'array' | 'regex' | 'string' */
    valueType?: string | null;
    /** True for operators that require no value input (e.g. isEmpty, exists) */
    noValue?: boolean | null;
    /** Example value hint shown in the UI (e.g. regex pattern) */
    example?: string | null;
}

export interface AdapterCodeMapping {
    value: string;
    label: string;
    adapterCode: string;
}

export interface WizardStrategyMapping {
    /** Wizard-internal value for existing records strategy (e.g. SKIP, UPDATE, REPLACE, ERROR) */
    wizardValue: string;
    /** Human-readable label */
    label: string;
    /** Backend LoadStrategy to use (e.g. CREATE, UPSERT) */
    loadStrategy: string;
    /** Backend ConflictStrategy to use (e.g. SOURCE_WINS, MERGE) */
    conflictStrategy: string;
}

export interface ConnectionSchemaFieldOption {
    value: string;
    label: string;
}

export interface ConnectionSchemaField {
    key: string;
    label: string;
    type: string;
    required?: boolean | null;
    placeholder?: string | null;
    defaultValue?: unknown;
    description?: string | null;
    options?: ConnectionSchemaFieldOption[] | null;
    /** Reference to a dynamic option list served by configOptions (e.g. 'authTypes', 'queueTypes', 'vendureEvents') */
    optionsRef?: string | null;
}

export interface ConnectionSchema {
    type: string;
    label: string;
    fields: ConnectionSchemaField[];
    /** True for HTTP-like connection types that use the dedicated HTTP editor with auth/headers support */
    httpLike?: boolean | null;
}

export interface DestinationSchema {
    /** Destination type key (e.g. SFTP, S3, HTTP) */
    type: string;
    /** Human-readable label */
    label: string;
    /** Key in the wizard destination state object (e.g. sftpConfig, s3Config) */
    configKey: string;
    /** Informational message for destination types with no configurable fields */
    message?: string | null;
    /**
     * Maps wizard field names to pipeline config field names.
     * When set, the wizard-to-pipeline converter renames fields accordingly.
     * Example: `{ directory: 'path', filename: 'filenamePattern' }`.
     */
    fieldMapping?: Record<string, string> | null;
    /** Field definitions for the destination configuration form */
    fields: ConnectionSchemaField[];
}

export interface HookStageConfig {
    /** Hook stage key (e.g. PIPELINE_STARTED, BEFORE_EXTRACT) */
    key: string;
    /** Human-readable label */
    label: string;
    /** Description of when this hook stage fires */
    description: string;
    /** Lucide icon name (kebab-case) for UI display */
    icon: string;
    /** Category for grouping (lifecycle, data, error) */
    category: string;
}

export interface HookStageCategoryConfig {
    /** Category key (e.g. lifecycle, data, error) */
    key: string;
    /** Human-readable label */
    label: string;
    /** CSS color classes for the category badge */
    color: string;
    /** Description of this category */
    description: string;
    /** CSS grid class for layout (e.g. grid-cols-3) */
    gridClass: string;
    /** Display order (lower = first) */
    order: number;
}

/** Matches the GraphQL DataHubConfigOptions type. */
interface ConfigOptionsData {
    stepTypes: StepTypeConfig[];
    loadStrategies: ConfigOptionValue[];
    conflictStrategies: ConfigOptionValue[];
    triggerTypes: TypedOptionValue[];
    fileEncodings: ConfigOptionValue[];
    csvDelimiters: ConfigOptionValue[];
    compressionTypes: ConfigOptionValue[];
    httpMethods: ConfigOptionValue[];
    authTypes: ConfigOptionValue[];
    destinationTypes: ConfigOptionValue[];
    fileFormats: ConfigOptionValue[];
    cleanupStrategies: ConfigOptionValue[];
    newRecordStrategies: ConfigOptionValue[];
    validationModes: ConfigOptionValue[];
    queueTypes: ConfigOptionValue[];
    vendureEvents: ConfigOptionValue[];
    comparisonOperators: ComparisonOperatorOption[];
    approvalTypes: TypedOptionValue[];
    backoffStrategies: ConfigOptionValue[];
    enrichmentSourceTypes: TypedOptionValue[];
    validationRuleTypes: TypedOptionValue[];
    exportAdapterCodes: AdapterCodeMapping[];
    feedAdapterCodes: AdapterCodeMapping[];
    connectionSchemas: ConnectionSchema[];
    destinationSchemas: DestinationSchema[];
    hookStages: HookStageConfig[];
    hookStageCategories: HookStageCategoryConfig[];
    logLevels: ConfigOptionValue[];
    runModes: ConfigOptionValue[];
    checkpointStrategies: ConfigOptionValue[];
    parallelErrorPolicies: ConfigOptionValue[];
    logPersistenceLevels: ConfigOptionValue[];
    adapterTypes: ConfigOptionValue[];
    runStatuses: ConfigOptionValue[];
    fieldTransformTypes: ConfigOptionValue[];
    wizardStrategyMappings: WizardStrategyMapping[];
    queryTypeOptions: ConfigOptionValue[];
    cronPresets: ConfigOptionValue[];
    ackModes: ConfigOptionValue[];
}

/** Fields that return ConfigOptionValue[] (value, label, description). */
type ConfigOptionValueField = Exclude<keyof ConfigOptionsData, 'stepTypes' | 'comparisonOperators' | 'exportAdapterCodes' | 'feedAdapterCodes' | 'connectionSchemas' | 'destinationSchemas' | 'hookStages' | 'hookStageCategories' | 'triggerTypes' | 'enrichmentSourceTypes' | 'validationRuleTypes' | 'approvalTypes' | 'wizardStrategyMappings'>;

/** Fields that return AdapterCodeMapping[] (value, label, adapterCode). */
type AdapterCodeMappingField = 'exportAdapterCodes' | 'feedAdapterCodes';

export type ConfigOptionsField = keyof ConfigOptionsData;

export function useConfigOptions() {
    return useQuery({
        queryKey: configOptionKeys.options(),
        queryFn: () => api.query(configOptionsDocument).then((res) => res.dataHubConfigOptions as unknown as ConfigOptionsData),
        staleTime: CACHE_TIMES.ADAPTER_CATALOG,
    });
}

export function useOptionValues(field: ConfigOptionValueField): { options: ConfigOptionValue[]; isLoading: boolean } {
    const { data, isLoading } = useConfigOptions();
    const options = useMemo(
        () => (data?.[field] ?? []).filter(o => o.value !== ''),
        [data, field],
    );
    return { options, isLoading };
}

export function useAdapterCodeMappings(field: AdapterCodeMappingField): { mappings: AdapterCodeMapping[]; isLoading: boolean } {
    const { data, isLoading } = useConfigOptions();
    const mappings = useMemo(
        () => data?.[field] ?? [],
        [data, field],
    );
    return { mappings, isLoading };
}

export function useConnectionSchemas(): { schemas: ConnectionSchema[]; isLoading: boolean } {
    const { data, isLoading } = useConfigOptions();
    const schemas = useMemo(
        () => data?.connectionSchemas ?? [],
        [data],
    );
    return { schemas, isLoading };
}

export function useDestinationSchemas(): { schemas: DestinationSchema[]; isLoading: boolean } {
    const { data, isLoading } = useConfigOptions();
    const schemas = useMemo(
        () => data?.destinationSchemas ?? [],
        [data],
    );
    return { schemas, isLoading };
}

export interface UseStepConfigsResult {
    /** Record of step type to config, backend-driven when loaded, static fallback while loading. */
    stepConfigs: Record<StepType, StepConfig>;
    /** Look up a single step config by type. */
    getStepConfig: (type: StepType | string) => StepConfig | undefined;
    /** Whether the backend data is still loading (using static fallback). */
    isLoading: boolean;
}

/**
 * Provides step type configuration from the backend (label, description, icon, colors, inputs/outputs).
 * Returns `DEFAULT_STEP_CONFIGS` as fallback while backend data is loading.
 */
export function useStepConfigs(): UseStepConfigsResult {
    const { data, isLoading } = useConfigOptions();

    const stepConfigs = useMemo<Record<StepType, StepConfig>>(() => {
        if (!data?.stepTypes?.length) return DEFAULT_STEP_CONFIGS;

        const record = { ...DEFAULT_STEP_CONFIGS };
        for (const st of data.stepTypes) {
            const type = st.type as StepType;
            if (type in record) {
                record[type] = {
                    type,
                    label: st.label,
                    description: st.description,
                    icon: st.icon,
                    color: st.color,
                    bgColor: st.bgColor,
                    borderColor: st.borderColor,
                    inputs: st.inputs,
                    outputs: st.outputs,
                    adapterType: st.adapterType ?? null,
                    nodeType: st.nodeType,
                };
            }
        }
        return record;
    }, [data]);

    const getStepConfig = useMemo(
        () => (type: StepType | string): StepConfig | undefined => {
            const normalized = String(type).toUpperCase() as StepType;
            return stepConfigs[normalized];
        },
        [stepConfigs],
    );

    return { stepConfigs, getStepConfig, isLoading };
}

/**
 * Provides all step mapping tables derived from backend step config data.
 * Returns `FALLBACK_STEP_MAPPINGS` while backend data is loading.
 *
 * The returned mappings include:
 * - `stepTypeToCategory`: StepType -> VisualNodeCategory
 * - `categoryToStepType`: VisualNodeCategory -> StepType
 * - `categoryToAdapterType`: VisualNodeCategory -> AdapterType
 * - `adapterTypeToNodeType`: AdapterType -> VisualNodeCategory
 * - `adapterTypeToCategory`: AdapterType -> UI category label
 * - `categoryColors`: VisualNodeCategory -> hex color
 */
export function useStepMappings(): { mappings: StepMappings; isLoading: boolean } {
    const { stepConfigs, isLoading } = useStepConfigs();

    const mappings = useMemo<StepMappings>(() => {
        if (isLoading) return FALLBACK_STEP_MAPPINGS;
        return buildStepMappings(stepConfigs);
    }, [stepConfigs, isLoading]);

    return { mappings, isLoading };
}

/**
 * Provides hook stage metadata from the backend (key, label, description, icon, category).
 * Returns an empty array while loading.
 */
export function useHookStages(): { hookStages: HookStageConfig[]; isLoading: boolean } {
    const { data, isLoading } = useConfigOptions();
    const hookStages = useMemo(
        () => data?.hookStages ?? [],
        [data],
    );
    return { hookStages, isLoading };
}

/**
 * Provides hook stage category metadata from the backend (key, label, color, description, gridClass, order).
 * Returns an empty array while loading.
 */
export function useHookStageCategories(): { categories: HookStageCategoryConfig[]; isLoading: boolean } {
    const { data, isLoading } = useConfigOptions();
    const categories = useMemo(
        () => {
            const raw = data?.hookStageCategories ?? [];
            return [...raw].sort((a, b) => a.order - b.order);
        },
        [data],
    );
    return { categories, isLoading };
}

/**
 * Provides comparison operator definitions from the backend, including UI hint fields
 * (valueType, noValue, example). Returns an empty array while loading.
 */
export function useComparisonOperators(): { operators: ComparisonOperatorOption[]; isLoading: boolean } {
    const { data, isLoading } = useConfigOptions();
    const operators = useMemo(
        () => data?.comparisonOperators ?? [],
        [data],
    );
    return { operators, isLoading };
}

/**
 * Provides trigger type schemas from the backend, including form field definitions,
 * default values, config key mappings, and wizard scope information.
 */
export function useTriggerTypeSchemas(): { schemas: TypedOptionValue[]; isLoading: boolean } {
    const { data, isLoading } = useConfigOptions();
    const schemas = useMemo(() => data?.triggerTypes ?? [], [data]);
    return { schemas, isLoading };
}

/**
 * Provides enrichment source type schemas from the backend, including form field definitions
 * and default values.
 */
export function useEnrichmentSourceSchemas(): { schemas: TypedOptionValue[]; isLoading: boolean } {
    const { data, isLoading } = useConfigOptions();
    const schemas = useMemo(() => data?.enrichmentSourceTypes ?? [], [data]);
    return { schemas, isLoading };
}

/**
 * Provides approval type schemas from the backend for gate step configuration,
 * including per-type form field definitions (e.g. timeout seconds, error threshold).
 */
export function useApprovalTypeSchemas(): { schemas: TypedOptionValue[]; isLoading: boolean } {
    const { data, isLoading } = useConfigOptions();
    const schemas = useMemo(() => data?.approvalTypes ?? [], [data]);
    return { schemas, isLoading };
}

/**
 * Provides validation rule type schemas from the backend, including form field definitions
 * and default values.
 */
export function useValidationRuleSchemas(): { schemas: TypedOptionValue[]; isLoading: boolean } {
    const { data, isLoading } = useConfigOptions();
    const schemas = useMemo(() => data?.validationRuleTypes ?? [], [data]);
    return { schemas, isLoading };
}

/**
 * Provides operator codes suitable for field-level transforms in the export wizard.
 * Returns options with value (operator code), label, and optional category grouping.
 */
export function useFieldTransformTypes(): { options: ConfigOptionValue[]; isLoading: boolean } {
    return useOptionValues('fieldTransformTypes');
}

/**
 * Provides wizard strategy mappings from the backend.
 * Maps wizard existingRecords values (SKIP, UPDATE, REPLACE, ERROR)
 * to backend LoadStrategy and ConflictStrategy values.
 */
export function useWizardStrategyMappings(): { mappings: WizardStrategyMapping[]; isLoading: boolean } {
    const { data, isLoading } = useConfigOptions();
    const mappings = useMemo(
        () => data?.wizardStrategyMappings ?? [],
        [data],
    );
    return { mappings, isLoading };
}

/**
 * Provides export query type options from the backend (all, query, graphql).
 */
export function useQueryTypeOptions(): { options: ConfigOptionValue[]; isLoading: boolean } {
    return useOptionValues('queryTypeOptions');
}

/**
 * Provides cron schedule presets from the backend for quick schedule trigger configuration.
 * Each preset has a cron expression (value), human-readable label, and description.
 */
export function useCronPresets(): { presets: ConfigOptionValue[]; isLoading: boolean } {
    const { options, isLoading } = useOptionValues('cronPresets');
    return { presets: options, isLoading };
}

/**
 * Provides message acknowledgment mode options from the backend for queue consumers.
 */
export function useAckModes(): { options: ConfigOptionValue[]; isLoading: boolean } {
    return useOptionValues('ackModes');
}
