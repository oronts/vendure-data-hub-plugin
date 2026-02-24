import { Query, Resolver } from '@nestjs/graphql';
import { Allow } from '@vendure/core';
import { DataHubPipelinePermission } from '../../permissions';
import {
    LoadStrategy,
    ConflictStrategy,
    FileEncoding,
    HttpMethod,
    ValidationMode,
    QueueType,
    LogLevel,
    RunMode,
    CheckpointStrategy,
    ParallelErrorPolicy,
    LogPersistenceLevel,
    ConnectionAuthType,
} from '../../constants/enums';
import { VENDURE_EVENTS } from '../../constants/events';
import { CONNECTION_SCHEMAS } from '../../constants/connection-schemas';
import { DESTINATION_SCHEMAS } from '../../constants/destination-schemas';
import { HOOK_STAGE_METADATA, HOOK_STAGE_CATEGORIES } from '../../constants/hook-stage-metadata';
import {
    enumToOptions,
    LOAD_STRATEGY_DESCRIPTIONS,
    CONFLICT_STRATEGY_DESCRIPTIONS,
    STEP_TYPE_CONFIGS,
    COMPARISON_OPERATORS,
    ADAPTER_TYPE_METADATA,
    RUN_STATUS_OPTIONS,
} from '../../constants/enum-metadata';
import {
    CSV_DELIMITER_OPTIONS,
    COMPRESSION_TYPES,
    CLEANUP_STRATEGIES,
    NEW_RECORD_STRATEGIES,
    DESTINATION_TYPES,
    APPROVAL_TYPES,
    BACKOFF_STRATEGIES,
    ENRICHMENT_SOURCE_TYPES,
    VALIDATION_RULE_TYPES,
    TRIGGER_TYPE_SCHEMAS,
    WIZARD_STRATEGY_MAPPINGS,
    QUERY_TYPE_OPTIONS,
    CRON_PRESETS,
    ACK_MODE_OPTIONS,
} from '../../constants/adapter-schema-options';
import { FILE_FORMAT_METADATA } from '../../constants/file-format-metadata';
import { EXPORT_ADAPTER_CODES, FEED_ADAPTER_CODES } from '../../constants/adapters';
import { FIELD_TRANSFORM_TYPES } from '../../operators';

@Resolver()
export class DataHubConfigOptionsAdminResolver {
    @Query()
    @Allow(DataHubPipelinePermission.Read)
    dataHubConfigOptions() {
        return {
            stepTypes: STEP_TYPE_CONFIGS,
            loadStrategies: enumToOptions(LoadStrategy, LOAD_STRATEGY_DESCRIPTIONS),
            conflictStrategies: enumToOptions(ConflictStrategy, CONFLICT_STRATEGY_DESCRIPTIONS),
            triggerTypes: TRIGGER_TYPE_SCHEMAS,
            fileEncodings: enumToOptions(FileEncoding),
            csvDelimiters: CSV_DELIMITER_OPTIONS,
            compressionTypes: COMPRESSION_TYPES,
            httpMethods: enumToOptions(HttpMethod),
            authTypes: enumToOptions(ConnectionAuthType),
            destinationTypes: DESTINATION_TYPES,
            fileFormats: Object.values(FILE_FORMAT_METADATA),
            cleanupStrategies: CLEANUP_STRATEGIES,
            newRecordStrategies: NEW_RECORD_STRATEGIES,
            validationModes: enumToOptions(ValidationMode),
            queueTypes: enumToOptions(QueueType),
            vendureEvents: VENDURE_EVENTS.map(e => ({
                value: e.event,
                label: e.label,
                description: e.description,
                category: e.category,
            })),
            comparisonOperators: COMPARISON_OPERATORS,
            approvalTypes: APPROVAL_TYPES,
            backoffStrategies: BACKOFF_STRATEGIES,
            enrichmentSourceTypes: ENRICHMENT_SOURCE_TYPES,
            validationRuleTypes: VALIDATION_RULE_TYPES,
            exportAdapterCodes: EXPORT_ADAPTER_CODES,
            feedAdapterCodes: FEED_ADAPTER_CODES,
            connectionSchemas: CONNECTION_SCHEMAS,
            destinationSchemas: DESTINATION_SCHEMAS,
            hookStages: HOOK_STAGE_METADATA,
            hookStageCategories: HOOK_STAGE_CATEGORIES,
            logLevels: enumToOptions(LogLevel),
            runModes: enumToOptions(RunMode),
            checkpointStrategies: enumToOptions(CheckpointStrategy),
            parallelErrorPolicies: enumToOptions(ParallelErrorPolicy),
            logPersistenceLevels: enumToOptions(LogPersistenceLevel),
            adapterTypes: ADAPTER_TYPE_METADATA,
            runStatuses: RUN_STATUS_OPTIONS,
            fieldTransformTypes: FIELD_TRANSFORM_TYPES,
            wizardStrategyMappings: WIZARD_STRATEGY_MAPPINGS,
            queryTypeOptions: QUERY_TYPE_OPTIONS,
            cronPresets: CRON_PRESETS,
            ackModes: ACK_MODE_OPTIONS,
        };
    }
}
