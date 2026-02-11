export type {
    WizardStep,
    WizardTransformationStep,
    ParsedData,
    FeedTemplate,
} from '../../../types/wizard';

export interface StepValidationResult {
    isValid: boolean;
    errors: Array<{ field: string; message: string }>;
    errorsByField: Record<string, string>;
}

export type {
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
