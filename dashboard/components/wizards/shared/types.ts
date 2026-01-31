export type {
    WizardStep,
    WizardProgress,
    WizardTransformationStep,
    ParsedData,
    FeedTemplate,
} from '../../../types/wizard';

/**
 * Common wizard props interface
 */
export interface BaseWizardProps<TConfig> {
    onComplete: (config: TConfig) => void;
    onCancel: () => void;
    initialConfig?: Partial<TConfig>;
}

/**
 * Common step props interface
 */
export interface BaseStepProps<TConfig> {
    config: Partial<TConfig>;
    updateConfig: (updates: Partial<TConfig>) => void;
    errors?: Record<string, string>;
}

export interface StepValidationResult {
    isValid: boolean;
    errors: Array<{ field: string; message: string }>;
    errorsByField: Record<string, string>;
}

export type {
    ImportConfig,
    ImportSourceConfig,
    FileSourceConfig,
    ApiSourceConfig,
    DatabaseSourceConfig,
    WebhookSourceConfig,
    ImportFieldMapping,
    ImportStrategies,
    ImportTriggerConfig,
} from '../../../types/wizard';

export type {
    ExportConfig,
    QueryConfig,
    ExportField,
    ExportFormatConfig,
    DestinationConfig,
    FileDestinationConfig,
    SftpDestinationConfig,
    HttpDestinationConfig,
    S3DestinationConfig,
    WebhookDestinationConfig,
    ExportTriggerConfig,
    CacheConfig,
    ExportOptions,
} from '../../../types/wizard';
