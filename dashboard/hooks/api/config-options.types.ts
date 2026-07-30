import type { DataHubConfigOptionsApiQuery } from '../../gql/graphql';

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
    adapterType: string | null;
    nodeType: string;
}

export interface ConfigOptionValue {
    value: string;
    label: string;
    description?: string | null;
    icon?: string | null;
    color?: string | null;
    category?: string | null;
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
    min?: number | null;
    max?: number | null;
    options?: ConnectionSchemaFieldOption[] | null;
    optionsRef?: string | null;
}

export interface TypedOptionValue extends ConfigOptionValue {
    fields: ConnectionSchemaField[];
    defaultValues?: Record<string, unknown> | null;
    configKeyMap?: Record<string, string> | null;
    wizardScopes?: string[] | null;
}

export interface FileFormatOption extends ConfigOptionValue {
    extensions: string[];
    mimeTypes: string[];
    supportsPreview: boolean;
    requiresClientParser: boolean;
    parseable: boolean;
}

export interface ComparisonOperatorOption {
    value: string;
    label: string;
    description?: string | null;
    valueType?: string | null;
    noValue?: boolean | null;
    example?: string | null;
}

export interface AdapterCodeMapping {
    value: string;
    label: string;
    adapterCode: string;
}

export interface ConnectionSchema {
    type: string;
    label: string;
    fields: ConnectionSchemaField[];
    httpLike?: boolean | null;
}

export interface DestinationSchema {
    type: string;
    label: string;
    configKey: string;
    message?: string | null;
    fieldMapping?: Record<string, string> | null;
    fields: ConnectionSchemaField[];
}

export interface HookStageConfig {
    key: string;
    label: string;
    description: string;
    icon: string;
    category: string;
}

export interface HookStageCategoryConfig {
    key: string;
    label: string;
    color: string;
    description: string;
    gridClass: string;
    order: number;
}

export interface RawWizardStrategyMapping {
    wizardValue: string;
    label: string;
    loadStrategy: string;
    conflictStrategy: string;
}

export interface ConfigOptionsData {
    stepTypes: StepTypeConfig[];
    loadStrategies: ConfigOptionValue[];
    conflictStrategies: ConfigOptionValue[];
    triggerTypes: TypedOptionValue[];
    fileEncodings: ConfigOptionValue[];
    csvDelimiters: ConfigOptionValue[];
    httpMethods: ConfigOptionValue[];
    authTypes: ConfigOptionValue[];
    destinationTypes: ConfigOptionValue[];
    fileFormats: FileFormatOption[];
    validationModes: ConfigOptionValue[];
    validationStrictnesses: ConfigOptionValue[];
    channelStrategies: ConfigOptionValue[];
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
    parallelErrorPolicies: ConfigOptionValue[];
    logPersistenceLevels: ConfigOptionValue[];
    adapterTypes: ConfigOptionValue[];
    runStatuses: ConfigOptionValue[];
    fieldTransformTypes: ConfigOptionValue[];
    wizardStrategyMappings: RawWizardStrategyMapping[];
    queryTypeOptions: ConfigOptionValue[];
    cronPresets: ConfigOptionValue[];
    ackModes: ConfigOptionValue[];
}

export type ConfigOptionValueField = Exclude<
    keyof ConfigOptionsData,
    | 'stepTypes'
    | 'comparisonOperators'
    | 'exportAdapterCodes'
    | 'feedAdapterCodes'
    | 'connectionSchemas'
    | 'destinationSchemas'
    | 'hookStages'
    | 'hookStageCategories'
    | 'triggerTypes'
    | 'enrichmentSourceTypes'
    | 'validationRuleTypes'
    | 'approvalTypes'
    | 'wizardStrategyMappings'
>;

export type AdapterCodeMappingField =
    | 'exportAdapterCodes'
    | 'feedAdapterCodes';

export type RawConfigOptionsData =
    DataHubConfigOptionsApiQuery['dataHubConfigOptions'];
