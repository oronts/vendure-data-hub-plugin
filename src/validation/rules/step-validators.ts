/**
 * Step Configuration Validators
 *
 * Validation functions for pipeline step configurations.
 * Validates step-specific settings, adapter configurations, and connections.
 */

import {
    StepType,
    LoadStrategy,
    TriggerType,
    DatabaseType,
    HttpMethod,
    PaginationType,
    QueueType,
} from '../../constants/enums';
import {
    VALIDATION_PATTERNS,
    FIELD_LIMITS,
} from '../../constants/validation';
import {
    PipelineErrorCode,
    LoaderErrorCode,
    ExtractorErrorCode,
    TransformErrorCode,
} from '../../constants/error-codes';
import { BATCH, VALIDATION_TIMEOUTS } from '../../constants/defaults';
import { EXTRACTOR_CODE } from '../../constants/adapters';
import { JsonObject } from '../../types/index';
import {
    StepValidationResult,
    StepValidationError,
    StepValidationWarning,
    StepDefinition,
} from './types';
import {
    createStepError as createError,
    createStepWarning as createWarning,
    combineStepResults as combineResults,
} from './helpers';
import { isValidTimezone as isValidTimezoneFromCron, validateCronExpression } from '../../jobs/processors/cron-processor';

export type {
    StepValidationResult,
    StepValidationError,
    StepValidationWarning,
    StepDefinition,
};

// CORE STEP VALIDATORS

/**
 * Validates that a step type is valid
 */
export function validateStepType(type: string): StepValidationResult {
    const validTypes = Object.values(StepType);
    if (!validTypes.includes(type as StepType)) {
        return {
            valid: false,
            errors: [createError('type', `Invalid step type: ${type}`, PipelineErrorCode.INVALID_STEP_TYPE)],
            warnings: [],
        };
    }
    return { valid: true, errors: [], warnings: [] };
}

/**
 * Validates step key format
 */
export function validateStepKey(key: string): StepValidationResult {
    const errors: StepValidationError[] = [];
    const warnings: StepValidationWarning[] = [];

    if (!key || typeof key !== 'string') {
        errors.push(createError('key', 'Step key is required', PipelineErrorCode.INVALID_DEFINITION));
        return { valid: false, errors, warnings };
    }

    if (key.length < FIELD_LIMITS.CODE_MIN || key.length > FIELD_LIMITS.CODE_MAX) {
        errors.push(createError(
            'key',
            `Step key must be between ${FIELD_LIMITS.CODE_MIN} and ${FIELD_LIMITS.CODE_MAX} characters`,
            PipelineErrorCode.INVALID_DEFINITION,
        ));
    }

    if (!VALIDATION_PATTERNS.SQL_IDENTIFIER.test(key)) {
        errors.push(createError(
            'key',
            'Step key must be alphanumeric with underscores only',
            PipelineErrorCode.INVALID_DEFINITION,
        ));
    }

    return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validates step concurrency setting
 */
export function validateStepConcurrency(concurrency?: number): StepValidationResult {
    if (concurrency === undefined) {
        return { valid: true, errors: [], warnings: [] };
    }

    const errors: StepValidationError[] = [];
    const warnings: StepValidationWarning[] = [];

    if (!Number.isInteger(concurrency) || concurrency < 1) {
        errors.push(createError(
            'concurrency',
            'Concurrency must be a positive integer',
            PipelineErrorCode.INVALID_DEFINITION,
        ));
    }

    if (concurrency > BATCH.MAX_IN_FLIGHT * 10) {
        warnings.push(createWarning(
            'concurrency',
            `High concurrency (${concurrency}) may impact performance`,
        ));
    }

    return { valid: errors.length === 0, errors, warnings };
}

// TRIGGER STEP VALIDATORS

/**
 * Validates if a timezone string is valid using Intl.DateTimeFormat
 *
 * @param timezone - The timezone string to validate (e.g., 'America/New_York', 'UTC')
 * @returns True if the timezone is valid
 */
export function isValidTimezone(timezone: string): boolean {
    if (!timezone || typeof timezone !== 'string') {
        return false;
    }
    return isValidTimezoneFromCron(timezone);
}

/**
 * Validates a timezone string for schedule triggers
 *
 * @param timezone - The timezone string to validate
 * @returns Validation result with warnings for invalid timezones
 */
export function validateTimezone(timezone: string | undefined): StepValidationResult {
    const errors: StepValidationError[] = [];
    const warnings: StepValidationWarning[] = [];

    if (timezone !== undefined && timezone !== null && timezone !== '') {
        if (typeof timezone !== 'string') {
            errors.push(createError(
                'config.timezone',
                'Timezone must be a string',
                PipelineErrorCode.INVALID_DEFINITION,
            ));
        } else if (!isValidTimezone(timezone)) {
            // Invalid timezone is a warning, not an error - will fall back to server time
            warnings.push(createWarning(
                'config.timezone',
                `Invalid timezone "${timezone}" - will fall back to server timezone. Use IANA timezone names (e.g., "America/New_York", "Europe/London", "UTC")`,
            ));
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validates TRIGGER step configuration.
 * Supported trigger types:
 * - MANUAL: No additional configuration required
 * - SCHEDULE: Requires cron expression or intervalSec
 * - WEBHOOK: Validates webhook path and authentication
 * - EVENT: Requires eventType
 * - FILE: Validates file watcher configuration
 * - MESSAGE: Validates message queue configuration
 */
export function validateTriggerConfig(config: JsonObject): StepValidationResult {
    const errors: StepValidationError[] = [];
    const warnings: StepValidationWarning[] = [];

    const triggerType = config.type as string;
    if (!triggerType) {
        errors.push(createError('config.type', 'Trigger type is required', PipelineErrorCode.INVALID_DEFINITION));
        return { valid: false, errors, warnings };
    }

    const validTriggerTypes = Object.values(TriggerType);
    if (!validTriggerTypes.includes(triggerType as TriggerType)) {
        errors.push(createError('config.type', `Invalid trigger type: ${triggerType}. Valid types: ${validTriggerTypes.join(', ')}`, PipelineErrorCode.INVALID_DEFINITION));
    }

    // Validate manual trigger - no additional config required
    if (triggerType === TriggerType.MANUAL) {
        // Manual triggers have no additional required fields
    }

    // Validate schedule trigger
    if (triggerType === TriggerType.SCHEDULE) {
        const cron = config.cron as string;
        const intervalSec = config.intervalSec as number;

        // Either cron or intervalSec must be provided
        if (!cron && (intervalSec === undefined || intervalSec === null)) {
            errors.push(createError('config', 'Schedule trigger requires either cron expression or intervalSec', PipelineErrorCode.INVALID_DEFINITION));
        }

        // Validate cron expression syntax if provided
        if (cron && typeof cron === 'string' && cron.trim().length > 0) {
            const cronValidation = validateCronExpression(cron);
            if (!cronValidation.valid) {
                errors.push(createError('config.cron', cronValidation.error ?? 'Invalid cron expression', PipelineErrorCode.INVALID_DEFINITION));
            }
        }

        // Validate intervalSec if provided
        if (intervalSec !== undefined && intervalSec !== null) {
            if (typeof intervalSec !== 'number' || intervalSec <= 0) {
                errors.push(createError('config.intervalSec', 'intervalSec must be a positive number', PipelineErrorCode.INVALID_DEFINITION));
            }
        }

        // Validate timezone if provided
        const timezone = config.timezone as string | undefined;
        const timezoneResult = validateTimezone(timezone);
        errors.push(...timezoneResult.errors);
        warnings.push(...timezoneResult.warnings);
    }

    // Validate webhook trigger
    if (triggerType === TriggerType.WEBHOOK) {
        const webhookPath = config.webhookPath as string;
        if (webhookPath && !webhookPath.startsWith('/')) {
            warnings.push(createWarning('config.webhookPath', 'Webhook path should start with /'));
        }
    }

    // Validate event trigger
    if (triggerType === TriggerType.EVENT) {
        const eventType = config.eventType as string;
        if (!eventType) {
            errors.push(createError('config.eventType', 'Event type is required for event triggers', PipelineErrorCode.INVALID_DEFINITION));
        }
    }

    // Validate file trigger
    if (triggerType === TriggerType.FILE) {
        const watchPath = config.watchPath as string;
        const connectionCode = config.connectionCode as string;
        if (!watchPath && !connectionCode) {
            errors.push(createError('config', 'File trigger requires watchPath or connectionCode', PipelineErrorCode.INVALID_DEFINITION));
        }
    }

    // Validate message trigger
    if (triggerType === TriggerType.MESSAGE) {
        const queueType = config.queueType as string;
        const queueName = config.queueName as string;
        const connectionCode = config.connectionCode as string;

        if (!connectionCode) {
            errors.push(createError('config.connectionCode', 'Connection is required for message triggers', PipelineErrorCode.INVALID_DEFINITION));
        }

        if (!queueName) {
            errors.push(createError('config.queueName', 'Queue name is required for message triggers', PipelineErrorCode.INVALID_DEFINITION));
        }

        if (queueType) {
            const validQueueTypes = Object.values(QueueType);
            if (!validQueueTypes.includes(queueType as QueueType)) {
                errors.push(createError('config.queueType', `Invalid queue type: ${queueType}. Valid types: ${validQueueTypes.join(', ')}`, PipelineErrorCode.INVALID_DEFINITION));
            }
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}

// EXTRACT STEP VALIDATORS

/**
 * Validates EXTRACT step configuration
 */
export function validateExtractConfig(config: JsonObject): StepValidationResult {
    const errors: StepValidationError[] = [];
    const warnings: StepValidationWarning[] = [];

    const adapterCode = config.adapterCode as string;
    if (!adapterCode) {
        errors.push(createError('config.adapterCode', 'Extractor adapterCode is required', ExtractorErrorCode.INVALID_FORMAT));
        return { valid: false, errors, warnings };
    }

    // Validate HTTP configuration
    if (adapterCode === EXTRACTOR_CODE.HTTP_API) {
        const url = config.url as string;
        if (!url) {
            errors.push(createError('config.url', 'URL is required for HTTP extractor', ExtractorErrorCode.INVALID_FORMAT));
        } else if (!VALIDATION_PATTERNS.URL.test(url) && !url.startsWith('${')) {
            // Allow variable references
            errors.push(createError('config.url', 'Invalid URL format', ExtractorErrorCode.INVALID_FORMAT));
        }

        const method = config.method as string;
        if (method) {
            const validMethods = Object.values(HttpMethod);
            if (!validMethods.includes(method as HttpMethod)) {
                errors.push(createError('config.method', `Invalid HTTP method: ${method}`, ExtractorErrorCode.INVALID_FORMAT));
            }
        }

        // Validate timeout
        const timeout = config.timeout as number;
        if (timeout !== undefined) {
            if (timeout < VALIDATION_TIMEOUTS.MIN_TIMEOUT_MS || timeout > VALIDATION_TIMEOUTS.MAX_TIMEOUT_MS) {
                warnings.push(createWarning('config.timeout', `Timeout should be between ${VALIDATION_TIMEOUTS.MIN_TIMEOUT_MS}ms and ${VALIDATION_TIMEOUTS.MAX_TIMEOUT_MS}ms`));
            }
        }
    }

    // Validate database configuration
    if (adapterCode === EXTRACTOR_CODE.DATABASE) {
        const dbType = config.databaseType as string;
        if (dbType) {
            const validTypes = Object.values(DatabaseType);
            if (!validTypes.includes(dbType as DatabaseType)) {
                errors.push(createError('config.databaseType', `Invalid database type: ${dbType}`, ExtractorErrorCode.INVALID_FORMAT));
            }
        }

        const query = config.query as string;
        if (!query && !config.table) {
            errors.push(createError('config.query', 'Query or table is required for database extractor', ExtractorErrorCode.INVALID_FORMAT));
        }
    }

    // Validate file configuration
    if (adapterCode === EXTRACTOR_CODE.FILE || adapterCode === EXTRACTOR_CODE.CSV || adapterCode === EXTRACTOR_CODE.JSON || adapterCode === EXTRACTOR_CODE.XML) {
        // File can come from various sources - path, upload, or variable
        const hasSource = config.path || config.filePath || config.source || config.uploadId;
        if (!hasSource) {
            warnings.push(createWarning('config.path', 'File source should be specified'));
        }
    }

    // Validate pagination
    const pagination = config.pagination as JsonObject;
    if (pagination) {
        const paginationType = pagination.type as string;
        if (paginationType) {
            const validTypes = Object.values(PaginationType);
            if (!validTypes.includes(paginationType as PaginationType)) {
                errors.push(createError('config.pagination.type', `Invalid pagination type: ${paginationType}`, ExtractorErrorCode.INVALID_FORMAT));
            }
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}

// TRANSFORM STEP VALIDATORS

/**
 * Validates TRANSFORM step configuration
 */
export function validateTransformConfig(config: JsonObject): StepValidationResult {
    const errors: StepValidationError[] = [];
    const warnings: StepValidationWarning[] = [];

    const adapterCode = config.adapterCode as string;
    const mappings = config.mappings as JsonObject[];
    const operations = config.operations as JsonObject[];

    // Must have adapterCode, mappings, or operations
    if (!adapterCode && !mappings && !operations) {
        errors.push(createError(
            'config',
            'Transform step requires adapterCode, mappings, or operations',
            TransformErrorCode.MAPPING_FAILED,
        ));
        return { valid: false, errors, warnings };
    }

    // Validate mappings
    if (mappings && Array.isArray(mappings)) {
        mappings.forEach((mapping, index) => {
            if (!mapping.source && !mapping.from) {
                errors.push(createError(
                    `config.mappings[${index}].source`,
                    'Mapping source field is required',
                    TransformErrorCode.FIELD_NOT_FOUND,
                ));
            }
            if (!mapping.target && !mapping.to) {
                errors.push(createError(
                    `config.mappings[${index}].target`,
                    'Mapping target field is required',
                    TransformErrorCode.FIELD_NOT_FOUND,
                ));
            }
        });
    }

    // Validate operations
    if (operations && Array.isArray(operations)) {
        operations.forEach((op, index) => {
            if (!op.type) {
                errors.push(createError(
                    `config.operations[${index}].type`,
                    'Operation type is required',
                    TransformErrorCode.INVALID_EXPRESSION,
                ));
            }
        });
    }

    return { valid: errors.length === 0, errors, warnings };
}

// VALIDATE STEP VALIDATORS

/**
 * Validates VALIDATE step configuration
 */
export function validateValidateConfig(config: JsonObject): StepValidationResult {
    const errors: StepValidationError[] = [];
    const warnings: StepValidationWarning[] = [];

    const rules = config.rules as JsonObject[];
    const schemaCode = config.schemaCode as string;
    const adapterCode = config.adapterCode as string;

    // Must have rules, schema, or adapterCode
    if (!rules && !schemaCode && !adapterCode) {
        errors.push(createError(
            'config',
            'Validate step requires rules, schemaCode, or adapterCode',
            PipelineErrorCode.INVALID_DEFINITION,
        ));
        return { valid: false, errors, warnings };
    }

    // Validate rules
    if (rules && Array.isArray(rules)) {
        rules.forEach((rule, index) => {
            if (!rule.field) {
                errors.push(createError(
                    `config.rules[${index}].field`,
                    'Validation rule field is required',
                    PipelineErrorCode.INVALID_DEFINITION,
                ));
            }
            if (!rule.type) {
                errors.push(createError(
                    `config.rules[${index}].type`,
                    'Validation rule type is required',
                    PipelineErrorCode.INVALID_DEFINITION,
                ));
            }
        });
    }

    return { valid: errors.length === 0, errors, warnings };
}

// ENRICH STEP VALIDATORS

/**
 * Validates ENRICH step configuration
 * ENRICH steps can use adapters, lookups, or transformations to add data
 */
export function validateEnrichConfig(config: JsonObject): StepValidationResult {
    const errors: StepValidationError[] = [];
    const warnings: StepValidationWarning[] = [];

    const adapterCode = config.adapterCode as string;
    const lookupConfig = config.lookupConfig as JsonObject;
    const mappings = config.mappings as JsonObject[];
    const operations = config.operations as JsonObject[];
    const enrichmentSource = config.enrichmentSource as string;

    // Must have adapterCode, lookupConfig, mappings, operations, or enrichmentSource
    if (!adapterCode && !lookupConfig && !mappings && !operations && !enrichmentSource) {
        errors.push(createError(
            'config',
            'Enrich step requires adapterCode, lookupConfig, mappings, operations, or enrichmentSource',
            PipelineErrorCode.INVALID_DEFINITION,
        ));
        return { valid: false, errors, warnings };
    }

    // Validate lookupConfig if present
    if (lookupConfig && typeof lookupConfig === 'object') {
        if (!lookupConfig.type && !lookupConfig.source) {
            warnings.push(createWarning(
                'config.lookupConfig',
                'Lookup configuration should specify type or source',
            ));
        }
    }

    // Validate mappings if present (reuse transform mapping validation)
    if (mappings && Array.isArray(mappings)) {
        mappings.forEach((mapping, index) => {
            if (!mapping.source && !mapping.from) {
                errors.push(createError(
                    `config.mappings[${index}].source`,
                    'Mapping source field is required',
                    TransformErrorCode.FIELD_NOT_FOUND,
                ));
            }
            if (!mapping.target && !mapping.to) {
                errors.push(createError(
                    `config.mappings[${index}].target`,
                    'Mapping target field is required',
                    TransformErrorCode.FIELD_NOT_FOUND,
                ));
            }
        });
    }

    return { valid: errors.length === 0, errors, warnings };
}

// ROUTE STEP VALIDATORS

/**
 * Validates ROUTE step configuration
 */
export function validateRouteConfig(config: JsonObject): StepValidationResult {
    const errors: StepValidationError[] = [];
    const warnings: StepValidationWarning[] = [];

    const branches = config.branches as Array<{ name: string; when?: JsonObject[] }>;

    if (!branches || !Array.isArray(branches)) {
        errors.push(createError('config.branches', 'ROUTE step requires branches array', PipelineErrorCode.INVALID_DEFINITION));
        return { valid: false, errors, warnings };
    }

    if (branches.length === 0) {
        errors.push(createError('config.branches', 'ROUTE step requires at least one branch', PipelineErrorCode.INVALID_DEFINITION));
        return { valid: false, errors, warnings };
    }

    const seenNames = new Set<string>();
    branches.forEach((branch, index) => {
        if (!branch.name) {
            errors.push(createError(`config.branches[${index}].name`, 'Branch name is required', PipelineErrorCode.INVALID_DEFINITION));
        } else {
            if (seenNames.has(branch.name)) {
                errors.push(createError(`config.branches[${index}].name`, `Duplicate branch name: ${branch.name}`, PipelineErrorCode.INVALID_DEFINITION));
            }
            seenNames.add(branch.name);
        }
    });

    return { valid: errors.length === 0, errors, warnings };
}

// LOAD STEP VALIDATORS

/**
 * Validates LOAD step configuration
 */
export function validateLoadConfig(config: JsonObject): StepValidationResult {
    const errors: StepValidationError[] = [];
    const warnings: StepValidationWarning[] = [];

    const entity = config.entity as string;
    const adapterCode = config.adapterCode as string;

    if (!entity && !adapterCode) {
        errors.push(createError('config', 'LOAD step requires entity or adapterCode', LoaderErrorCode.VALIDATION_FAILED));
        return { valid: false, errors, warnings };
    }

    // Validate strategy
    const strategy = config.strategy as string;
    if (strategy) {
        const validStrategies = Object.values(LoadStrategy);
        if (!validStrategies.includes(strategy as LoadStrategy)) {
            errors.push(createError('config.strategy', `Invalid load strategy: ${strategy}`, LoaderErrorCode.VALIDATION_FAILED));
        }
    }

    // Validate batch size
    const batchSize = config.batchSize as number;
    if (batchSize !== undefined) {
        if (batchSize < FIELD_LIMITS.BATCH_SIZE_MIN || batchSize > FIELD_LIMITS.BATCH_SIZE_MAX) {
            errors.push(createError(
                'config.batchSize',
                `Batch size must be between ${FIELD_LIMITS.BATCH_SIZE_MIN} and ${FIELD_LIMITS.BATCH_SIZE_MAX}`,
                LoaderErrorCode.VALIDATION_FAILED,
            ));
        }
    }

    // Validate lookup fields for upsert/merge
    if (strategy === LoadStrategy.UPSERT || strategy === LoadStrategy.MERGE) {
        const lookupFields = config.lookupFields as string[];
        if (!lookupFields || lookupFields.length === 0) {
            warnings.push(createWarning('config.lookupFields', `${strategy} strategy works best with lookup fields specified`));
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}

// EXPORT STEP VALIDATORS

/**
 * Validates EXPORT step configuration
 */
export function validateExportConfig(config: JsonObject): StepValidationResult {
    const errors: StepValidationError[] = [];
    const warnings: StepValidationWarning[] = [];

    const format = config.format as string;
    const adapterCode = config.adapterCode as string;

    if (!format && !adapterCode) {
        errors.push(createError('config', 'EXPORT step requires format or adapterCode', PipelineErrorCode.INVALID_DEFINITION));
        return { valid: false, errors, warnings };
    }

    return { valid: errors.length === 0, errors, warnings };
}

// SINK STEP VALIDATORS

/**
 * Validates SINK step configuration
 */
export function validateSinkConfig(config: JsonObject): StepValidationResult {
    const errors: StepValidationError[] = [];
    const warnings: StepValidationWarning[] = [];

    const adapterCode = config.adapterCode as string;
    if (!adapterCode) {
        errors.push(createError('config.adapterCode', 'SINK step requires adapterCode', PipelineErrorCode.INVALID_DEFINITION));
        return { valid: false, errors, warnings };
    }

    return { valid: errors.length === 0, errors, warnings };
}

// FEED STEP VALIDATORS

/**
 * Validates FEED step configuration
 */
export function validateFeedConfig(config: JsonObject): StepValidationResult {
    const errors: StepValidationError[] = [];
    const warnings: StepValidationWarning[] = [];

    const adapterCode = config.adapterCode as string;
    const feedType = config.feedType as string;

    if (!adapterCode && !feedType) {
        errors.push(createError('config', 'FEED step requires adapterCode or feedType', PipelineErrorCode.INVALID_DEFINITION));
        return { valid: false, errors, warnings };
    }

    return { valid: errors.length === 0, errors, warnings };
}

// MAIN STEP VALIDATOR

/**
 * Validates a complete step definition
 */
export function validateStep(step: StepDefinition): StepValidationResult {
    const keyResult = validateStepKey(step.key);
    const typeResult = validateStepType(step.type);
    const concurrencyResult = validateStepConcurrency(step.concurrency);

    // Combine base validations
    const result = combineResults(keyResult, typeResult, concurrencyResult);

    // Early return if base validation fails
    if (!result.valid) {
        return result;
    }

    // Validate config based on step type
    let configResult: StepValidationResult = { valid: true, errors: [], warnings: [] };

    if (!step.config || typeof step.config !== 'object') {
        return {
            valid: false,
            errors: [createError('config', 'Step config must be an object', PipelineErrorCode.INVALID_DEFINITION)],
            warnings: [],
        };
    }

    switch (step.type) {
        case StepType.TRIGGER:
            configResult = validateTriggerConfig(step.config);
            break;
        case StepType.EXTRACT:
            configResult = validateExtractConfig(step.config);
            break;
        case StepType.TRANSFORM:
            configResult = validateTransformConfig(step.config);
            break;
        case StepType.ENRICH:
            configResult = validateEnrichConfig(step.config);
            break;
        case StepType.VALIDATE:
            configResult = validateValidateConfig(step.config);
            break;
        case StepType.ROUTE:
            configResult = validateRouteConfig(step.config);
            break;
        case StepType.LOAD:
            configResult = validateLoadConfig(step.config);
            break;
        case StepType.EXPORT:
            configResult = validateExportConfig(step.config);
            break;
        case StepType.SINK:
            configResult = validateSinkConfig(step.config);
            break;
        case StepType.FEED:
            configResult = validateFeedConfig(step.config);
            break;
        default:
            // This should not happen if StepType enum is exhaustive
            // but provides a safety net for future step types
            configResult = {
                valid: true,
                errors: [],
                warnings: [createWarning(
                    'config',
                    `Step type "${step.type}" does not have specific config validation - config accepted as-is`,
                )],
            };
            break;
    }

    return combineResults(result, configResult);
}

/**
 * Validates an array of steps
 */
export function validateSteps(steps: StepDefinition[]): StepValidationResult {
    const errors: StepValidationError[] = [];
    const warnings: StepValidationWarning[] = [];

    if (!Array.isArray(steps)) {
        return {
            valid: false,
            errors: [createError('steps', 'Steps must be an array', PipelineErrorCode.INVALID_DEFINITION)],
            warnings: [],
        };
    }

    // Check for duplicate keys
    const seenKeys = new Set<string>();
    steps.forEach((step, index) => {
        if (seenKeys.has(step.key)) {
            errors.push(createError(`steps[${index}].key`, `Duplicate step key: ${step.key}`, PipelineErrorCode.INVALID_DEFINITION));
        }
        seenKeys.add(step.key);

        const stepResult = validateStep(step);
        errors.push(...stepResult.errors.map(e => ({
            ...e,
            field: `steps[${index}].${e.field}`,
        })));
        warnings.push(...stepResult.warnings.map(w => ({
            ...w,
            field: `steps[${index}].${w.field}`,
        })));
    });

    return { valid: errors.length === 0, errors, warnings };
}
