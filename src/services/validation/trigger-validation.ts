import { AckMode, StepType as StepTypeEnum, QueueType } from '../../constants/enums';
import { FILE_WATCH, QUEUE, WEBHOOK } from '../../constants/defaults';
import {
    PipelineDefinition,
    TriggerConfig,
    MessageTriggerConfig,
    FileWatchTriggerConfig,
    QueueTypeValue,
} from '../../types/index';
import { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { CODE_PATTERN, VENDURE_EVENT_TYPES } from '../../../shared';
import { isValidCron } from '../../../shared/utils/validation';

// ============================================================================
// Type Definitions
// ============================================================================

interface TriggerStepConfig extends TriggerConfig {
    message?: MessageTriggerConfig;
    fileWatch?: FileWatchTriggerConfig;
}

const MESSAGE_INTEGER_LIMITS = [
    { field: 'batchSize', min: QUEUE.MIN_MESSAGE_BATCH_SIZE, max: QUEUE.MAX_MESSAGE_BATCH_SIZE, errorCode: 'invalid-batch-size' },
    { field: 'concurrency', min: QUEUE.MIN_MESSAGE_CONCURRENCY, max: QUEUE.MAX_MESSAGE_CONCURRENCY, errorCode: 'invalid-concurrency' },
    { field: 'prefetch', min: QUEUE.MIN_MESSAGE_PREFETCH, max: QUEUE.MAX_MESSAGE_PREFETCH, errorCode: 'invalid-prefetch' },
    { field: 'pollIntervalMs', min: QUEUE.DEFAULT_MESSAGE_POLL_INTERVAL_MS, max: QUEUE.MAX_MESSAGE_POLL_INTERVAL_MS, errorCode: 'invalid-poll-interval' },
] as const;

// ============================================================================
// Type Guards
// ============================================================================

function isTriggerStepConfig(config: unknown): config is TriggerStepConfig {
    if (typeof config !== 'object' || config === null) {
        return false;
    }
    const cfg = config as Record<string, unknown>;
    // Must have a type property if it's a trigger config
    if (cfg.type !== undefined && typeof cfg.type !== 'string') {
        return false;
    }
    // message property, if present, must be an object
    if (cfg.message !== undefined && (typeof cfg.message !== 'object' || cfg.message === null)) {
        return false;
    }
    return true;
}

function isMessageTriggerConfig(
    value: unknown,
): value is MessageTriggerConfig {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const cfg = value as Record<string, unknown>;
    // queueType, if present, must be a string
    if (cfg.queueType !== undefined && typeof cfg.queueType !== 'string') {
        return false;
    }
    // connectionCode, if present, must be a string
    if (cfg.connectionCode !== undefined && typeof cfg.connectionCode !== 'string') {
        return false;
    }
    // queueName, if present, must be a string
    if (cfg.queueName !== undefined && typeof cfg.queueName !== 'string') {
        return false;
    }
    return true;
}

function getTriggerType(config: TriggerStepConfig): string | undefined {
    return typeof config.type === 'string' ? config.type : undefined;
}

function getQueueType(
    msgConfig: MessageTriggerConfig & { queue?: string } | undefined,
): QueueTypeValue | undefined {
    if (!msgConfig) return undefined;
    const qt = msgConfig.queueType;
    return typeof qt === 'string' ? (qt as QueueTypeValue) : undefined;
}

function rejectUnsupportedTriggerFields(
    config: unknown,
    fields: readonly string[],
    stepKey: string,
    triggerType: string,
    issues: PipelineDefinitionIssue[],
): void {
    if (config === null || typeof config !== 'object') return;
    for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(config, field)) continue;
        issues.push({
            message: `Step "${stepKey}": ${triggerType} trigger field "${field}" is not supported`,
            stepKey,
            field,
            errorCode: `unsupported-${triggerType}-trigger-field`,
        });
    }
}

// ============================================================================
// Validation Functions
// ============================================================================

export function validateTrigger(
    definition: PipelineDefinition,
    issues: PipelineDefinitionIssue[],
    warnings: PipelineDefinitionIssue[],
): void {
    const triggerSteps = definition.steps.filter(
        step => step.type === StepTypeEnum.TRIGGER,
    );
    for (const triggerStep of triggerSteps) {
        const rawConfig = triggerStep.config ?? {};
        if (!isTriggerStepConfig(rawConfig)) {
            addWebhookIssue(
                issues,
                triggerStep.key,
                'trigger configuration must be an object',
                'invalid-trigger-config',
            );
            continue;
        }

        const cfg = rawConfig as TriggerStepConfig;
        const triggerTypeLower = getTriggerType(cfg)?.toLowerCase();
        if (triggerTypeLower === 'message') {
            validateMessageTrigger(triggerStep.key, cfg, issues);
        } else if (triggerTypeLower === 'file') {
            validateFileTrigger(triggerStep.key, cfg, definition, issues);
        } else if (triggerTypeLower === 'schedule') {
            validateScheduleTrigger(triggerStep.key, cfg, issues);
        } else if (triggerTypeLower === 'webhook') {
            validateWebhookTrigger(triggerStep.key, cfg, issues, warnings);
        } else if (triggerTypeLower === 'event') {
            validateEventTrigger(triggerStep.key, cfg, issues);
        }
    }
}

function validateMessageTrigger(
    stepKey: string,
    cfg: TriggerStepConfig,
    issues: PipelineDefinitionIssue[],
): void {
    const messageConfig = isMessageTriggerConfig(cfg.message) ? cfg.message : undefined;
    rejectUnsupportedTriggerFields(
        cfg.message,
        ['bindingArgs', 'filterExpression'],
        stepKey,
        'message',
        issues,
    );
    const queueType = getQueueType(messageConfig);
    const queueTypeUpper = queueType?.toUpperCase().replace(/-/g, '_');

    // All supported queue types
    const supportedQueueTypes = new Set([
        QueueType.RABBITMQ,
        QueueType.RABBITMQ_AMQP,
        QueueType.SQS,
        QueueType.REDIS_STREAMS,
        QueueType.INTERNAL,
    ]);

    if (!queueType) {
        issues.push({
            message: `Step "${stepKey}": message trigger requires queueType (${Array.from(supportedQueueTypes).join(', ')})`,
            stepKey,
            errorCode: 'missing-queue-type',
        });
        return;
    }

    if (!supportedQueueTypes.has(queueTypeUpper as QueueType)) {
        issues.push({
            message: `Step "${stepKey}": unsupported queueType "${queueType}". Supported types: ${Array.from(supportedQueueTypes).join(', ')}`,
            stepKey,
            errorCode: 'unsupported-queue-type',
        });
        return;
    }

    // Validate required fields based on queue type
    if (!messageConfig?.connectionCode && queueTypeUpper !== QueueType.INTERNAL) {
        issues.push({
            message: `Step "${stepKey}": ${queueType} message trigger requires connectionCode`,
            stepKey,
            errorCode: 'missing-connection-code',
        });
    }

    if (!messageConfig?.queueName) {
        issues.push({
            message: `Step "${stepKey}": ${queueType} message trigger requires queue name`,
            stepKey,
            errorCode: 'missing-queue',
        });
    }

    if (messageConfig?.consumerGroup && queueTypeUpper !== QueueType.REDIS_STREAMS) {
        issues.push({
            message: `Step "${stepKey}": consumerGroup is supported only for REDIS_STREAMS message triggers`,
            stepKey,
            errorCode: 'unsupported-consumer-group',
        });
    }

    if (
        messageConfig?.ackMode !== undefined &&
        messageConfig.ackMode !== AckMode.MANUAL
    ) {
        issues.push({
            message: `Step "${stepKey}": message triggers require MANUAL acknowledgment so delivery follows the terminal pipeline-run outcome`,
            stepKey,
            errorCode: 'unsupported-ack-mode',
        });
    }

    if (queueTypeUpper === QueueType.RABBITMQ) {
        issues.push({
            message: `Step "${stepKey}": RABBITMQ HTTP cannot provide terminal-run acknowledgment; use RABBITMQ_AMQP`,
            stepKey,
            errorCode: 'unsupported-ack-mode',
        });
    }

    if (
        messageConfig?.maxRetries !== undefined &&
        (
            !Number.isSafeInteger(messageConfig.maxRetries) ||
            messageConfig.maxRetries < 0 ||
            messageConfig.maxRetries > QUEUE.MAX_MESSAGE_RETRIES
        )
    ) {
        issues.push({
            message: `Step "${stepKey}": maxRetries must be an integer from 0 to ${QUEUE.MAX_MESSAGE_RETRIES}`,
            stepKey,
            errorCode: 'invalid-max-retries',
        });
    }

    for (const limit of MESSAGE_INTEGER_LIMITS) {
        const value = messageConfig?.[limit.field];
        if (value === undefined) continue;
        if (!Number.isSafeInteger(value) || value < limit.min || value > limit.max) {
            issues.push({
                message: `Step "${stepKey}": ${limit.field} must be an integer from ${limit.min} to ${limit.max}`,
                stepKey,
                field: limit.field,
                errorCode: limit.errorCode,
            });
        }
    }
}

function validateFileTrigger(
    stepKey: string,
    cfg: TriggerStepConfig,
    definition: PipelineDefinition,
    issues: PipelineDefinitionIssue[],
): void {
    const fileWatchConfig = cfg.fileWatch;
    rejectUnsupportedTriggerFields(
        cfg.fileWatch,
        ['events', 'debounceMs'],
        stepKey,
        'file',
        issues,
    );

    if (!fileWatchConfig) {
        issues.push({
            message: `Step "${stepKey}": file trigger requires fileWatch configuration`,
            stepKey,
            errorCode: 'missing-file-watch-config',
        });
        return;
    }

    // Validate connectionCode
    if (!fileWatchConfig.connectionCode || typeof fileWatchConfig.connectionCode !== 'string') {
        issues.push({
            message: `Step "${stepKey}": file trigger requires connectionCode (connection to FTP/S3/SFTP)`,
            stepKey,
            errorCode: 'missing-connection-code',
        });
    }

    // Validate path
    if (!fileWatchConfig.path || typeof fileWatchConfig.path !== 'string') {
        issues.push({
            message: `Step "${stepKey}": file trigger requires path to watch`,
            stepKey,
            errorCode: 'missing-watch-path',
        });
    }

    // Validate pollIntervalMs if provided
    if (fileWatchConfig.pollIntervalMs !== undefined) {
        if (typeof fileWatchConfig.pollIntervalMs !== 'number' || fileWatchConfig.pollIntervalMs < FILE_WATCH.MIN_POLL_INTERVAL_MS) {
            issues.push({
                message: `Step "${stepKey}": pollIntervalMs must be at least ${FILE_WATCH.MIN_POLL_INTERVAL_MS} (${FILE_WATCH.MIN_POLL_INTERVAL_MS / 1000} seconds)`,
                stepKey,
                errorCode: 'invalid-poll-interval',
            });
        }
    }

    const outgoingKeys = new Set(
        (definition.edges ?? [])
            .filter(edge => edge.from === stepKey)
            .map(edge => edge.to),
    );
    const sourceSteps = definition.steps.filter(
        step => outgoingKeys.has(step.key) && step.type === StepTypeEnum.EXTRACT,
    );
    const supportedExtractors = new Set(['ftp', 's3']);
    if (sourceSteps.length === 0) {
        issues.push({
            message: `Step "${stepKey}": file trigger must connect directly to an FTP/SFTP or S3 extractor`,
            stepKey,
            errorCode: 'missing-file-watch-extractor',
        });
    }
    for (const sourceStep of sourceSteps) {
        const adapterCode = sourceStep.adapterCode ?? (
            typeof sourceStep.config?.adapterCode === 'string'
                ? sourceStep.config.adapterCode
                : undefined
        );
        if (!adapterCode || !supportedExtractors.has(adapterCode)) {
            issues.push({
                message: `Step "${sourceStep.key}": file trigger sources require the ftp or s3 extractor`,
                stepKey: sourceStep.key,
                errorCode: 'invalid-file-watch-extractor',
            });
        }
    }
}

function validateScheduleTrigger(
    stepKey: string,
    cfg: TriggerStepConfig,
    issues: PipelineDefinitionIssue[],
): void {
    const rawCfg = cfg as unknown as Record<string, unknown>;
    const cronConfigured = rawCfg.cron !== undefined;
    const intervalConfigured = rawCfg.intervalSec !== undefined;

    if (cronConfigured === intervalConfigured) {
        issues.push({
            message: `Step "${stepKey}": schedule trigger requires exactly one of cron or intervalSec`,
            stepKey,
            errorCode: 'invalid-schedule-mode',
        });
        return;
    }

    if (cronConfigured) {
        const cron = rawCfg.cron;
        if (typeof cron !== 'string' || !cron.trim() || !isValidCron(cron)) {
            issues.push({
                message: `Step "${stepKey}": cron must be a valid 5-field expression`,
                stepKey,
                errorCode: 'invalid-cron-expression',
            });
        }
    } else {
        const intervalSec = rawCfg.intervalSec;
        if (!Number.isSafeInteger(intervalSec) || Number(intervalSec) < 1) {
            issues.push({
                message: `Step "${stepKey}": intervalSec must be a positive integer`,
                stepKey,
                errorCode: 'invalid-schedule-interval',
            });
        }
    }

    if (rawCfg.timezone !== undefined) {
        try {
            if (typeof rawCfg.timezone !== 'string' || !rawCfg.timezone.trim()) throw new Error();
            Intl.DateTimeFormat(undefined, { timeZone: rawCfg.timezone });
        } catch {
            issues.push({
                message: `Step "${stepKey}": timezone must be a valid IANA timezone`,
                stepKey,
                errorCode: 'invalid-schedule-timezone',
            });
        }
    }
}

const WEBHOOK_AUTH_TYPES = new Set(['NONE', 'BASIC', 'API_KEY', 'HMAC', 'JWT']);
const LEGACY_WEBHOOK_FIELDS = [
    'authType',
    'signature',
    'signatureHeader',
    'hmacSecretCode',
    'secret',
    'webhookPath',
    'webhookCode',
    'path',
    'method',
] as const;
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function addWebhookIssue(
    issues: PipelineDefinitionIssue[],
    stepKey: string,
    message: string,
    errorCode: string,
): void {
    issues.push({ message: `Step "${stepKey}": ${message}`, stepKey, errorCode });
}

function validateSecretCode(
    rawCfg: Record<string, unknown>,
    field: string,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    const value = rawCfg[field];
    if (typeof value !== 'string' || !CODE_PATTERN.test(value)) {
        addWebhookIssue(
            issues,
            stepKey,
            `webhook trigger requires a valid ${field} Secret Code`,
            `invalid-${field.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)}`,
        );
    }
}

function validateOptionalHeader(
    rawCfg: Record<string, unknown>,
    field: string,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    const value = rawCfg[field];
    if (value !== undefined && (typeof value !== 'string' || !HEADER_NAME_PATTERN.test(value))) {
        addWebhookIssue(
            issues,
            stepKey,
            `webhook ${field} must be a valid HTTP header name`,
            'invalid-webhook-header-name',
        );
    }
}

function validateOptionalJwtClaim(
    rawCfg: Record<string, unknown>,
    field: 'jwtIssuer' | 'jwtAudience',
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    const value = rawCfg[field];
    if (
        value !== undefined &&
        (typeof value !== 'string' || value.trim() !== value || value.length === 0 ||
            value.length > WEBHOOK.MAX_JWT_CLAIM_LENGTH)
    ) {
        addWebhookIssue(
            issues,
            stepKey,
            `webhook ${field} must contain 1-${WEBHOOK.MAX_JWT_CLAIM_LENGTH} non-whitespace characters`,
            'invalid-webhook-jwt-claim',
        );
    }
}

function validateWebhookRequestControls(
    rawCfg: Record<string, unknown>,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    const rateLimit = rawCfg.rateLimit;
    if (
        rateLimit !== undefined &&
        (!Number.isInteger(rateLimit) || Number(rateLimit) < 0 ||
            Number(rateLimit) > WEBHOOK.MAX_RATE_LIMIT_REQUESTS)
    ) {
        addWebhookIssue(issues, stepKey, 'webhook rateLimit is out of range', 'invalid-webhook-rate-limit');
    }

    const rateLimitWindow = rawCfg.rateLimitWindow;
    if (
        rateLimitWindow !== undefined &&
        (!Number.isInteger(rateLimitWindow) ||
            Number(rateLimitWindow) < WEBHOOK.MIN_RATE_LIMIT_WINDOW_SEC ||
            Number(rateLimitWindow) > WEBHOOK.MAX_RATE_LIMIT_WINDOW_SEC)
    ) {
        addWebhookIssue(
            issues,
            stepKey,
            'webhook rateLimitWindow is out of range',
            'invalid-webhook-rate-limit-window',
        );
    }

    const idempotencyTtl = rawCfg.idempotencyTtlSec;
    if (
        idempotencyTtl !== undefined &&
        (!Number.isInteger(idempotencyTtl) ||
            Number(idempotencyTtl) < WEBHOOK.MIN_IDEMPOTENCY_TTL_SEC ||
            Number(idempotencyTtl) > WEBHOOK.MAX_IDEMPOTENCY_TTL_SEC)
    ) {
        addWebhookIssue(
            issues,
            stepKey,
            'webhook idempotencyTtlSec is out of range',
            'invalid-webhook-idempotency-ttl',
        );
    }
}

function validateWebhookTrigger(
    stepKey: string,
    cfg: TriggerStepConfig,
    issues: PipelineDefinitionIssue[],
    warnings: PipelineDefinitionIssue[],
): void {
    const rawCfg = cfg as unknown as Record<string, unknown>;
    for (const field of LEGACY_WEBHOOK_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(rawCfg, field)) {
            addWebhookIssue(
                issues,
                stepKey,
                `legacy webhook field "${field}" is not supported`,
                'legacy-webhook-field',
            );
        }
    }

    const authType = rawCfg.authentication;
    if (typeof authType !== 'string' || !WEBHOOK_AUTH_TYPES.has(authType)) {
        addWebhookIssue(
            issues,
            stepKey,
            'webhook authentication must be one of NONE, BASIC, API_KEY, HMAC, or JWT',
            'invalid-webhook-authentication',
        );
        return;
    }

    if (authType === 'HMAC') {
        validateSecretCode(rawCfg, 'secretCode', stepKey, issues);
        const algorithm = rawCfg.hmacAlgorithm ?? 'SHA256';
        if (algorithm !== 'SHA256' && algorithm !== 'SHA512') {
            addWebhookIssue(
                issues,
                stepKey,
                'webhook hmacAlgorithm must be SHA256 or SHA512',
                'invalid-webhook-hmac-algorithm',
            );
        }
    } else if (authType === 'API_KEY') {
        validateSecretCode(rawCfg, 'apiKeySecretCode', stepKey, issues);
    } else if (authType === 'BASIC') {
        validateSecretCode(rawCfg, 'basicSecretCode', stepKey, issues);
    } else if (authType === 'JWT') {
        validateSecretCode(rawCfg, 'jwtSecretCode', stepKey, issues);
    } else {
        warnings.push({
            message: `Step "${stepKey}": webhook authentication is explicitly disabled`,
            stepKey,
            errorCode: 'unauthenticated-webhook',
        });
    }

    for (const field of [
        'apiKeyHeaderName',
        'hmacHeaderName',
        'jwtHeaderName',
        'idempotencyKeyHeader',
    ]) {
        validateOptionalHeader(rawCfg, field, stepKey, issues);
    }
    validateOptionalJwtClaim(rawCfg, 'jwtIssuer', stepKey, issues);
    validateOptionalJwtClaim(rawCfg, 'jwtAudience', stepKey, issues);
    validateWebhookRequestControls(rawCfg, stepKey, issues);
}

const SUPPORTED_VENDURE_EVENTS = new Set<string>(VENDURE_EVENT_TYPES);
const UNSUPPORTED_EVENT_TRIGGER_FIELDS = [
    'entityType',
    'conditions',
    'filter',
    'debounceMs',
    'batchSize',
    'batchTimeoutMs',
] as const;

function validateEventTrigger(
    stepKey: string,
    cfg: TriggerStepConfig,
    issues: PipelineDefinitionIssue[],
): void {
    const rawCfg = cfg as unknown as Record<string, unknown>;
    for (const field of UNSUPPORTED_EVENT_TRIGGER_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(rawCfg, field)) {
            issues.push({
                message: `Step "${stepKey}": EVENT trigger field "${field}" is not supported`,
                stepKey,
                errorCode: 'unsupported-event-trigger-field',
            });
        }
    }

    const event = rawCfg.event;
    if (typeof event !== 'string' || !event.trim()) {
        issues.push({
            message: `Step "${stepKey}": event trigger requires event field`,
            stepKey,
            errorCode: 'missing-event-type',
        });
    } else if (!SUPPORTED_VENDURE_EVENTS.has(event)) {
        issues.push({
            message: `Step "${stepKey}": unsupported Vendure event "${event}"`,
            stepKey,
            errorCode: 'unsupported-event-type',
        });
    }
}
