/**
 * Pipeline run-level event types for SSE/WebSocket subscriptions
 *
 * Note: These use PascalCase for consistency with Vendure event naming conventions
 */
export const RUN_EVENT_TYPES = [
    'PipelineRunStarted',
    'PipelineRunProgress',
    'PipelineRunCompleted',
    'PipelineRunFailed',
    'PipelineRunCancelled',
] as const;

/**
 * Webhook delivery event types for tracking webhook lifecycle
 *
 * Note: These use PascalCase for consistency with Vendure event naming conventions
 */
export const WEBHOOK_EVENT_TYPES = [
    'WebhookDeliveryAttempted',
    'WebhookDeliverySucceeded',
    'WebhookDeliveryFailed',
    'WebhookDeliveryRetrying',
    'WebhookDeliveryDeadLetter',
] as const;

/**
 * Step-level event types emitted during pipeline step execution
 *
 * Note: Step lifecycle events use PascalCase (StepStarted, etc.)
 * Record-level domain events use SCREAMING_SNAKE_CASE (RECORD_EXTRACTED, etc.)
 */
export const STEP_EVENT_TYPES = [
    'StepStarted',
    'StepProgress',
    'StepCompleted',
    'StepFailed',
    'RECORD_EXTRACTED',
    'RECORD_TRANSFORMED',
    'RECORD_VALIDATED',
    'RECORD_LOADED',
] as const;

/**
 * Log event types for real-time log streaming
 *
 * Note: These use PascalCase for consistency with Vendure event naming conventions
 */
export const LOG_EVENT_TYPES = [
    'LogAdded',
] as const;

/** Union type of all pipeline run event types */
export type RunEventType = (typeof RUN_EVENT_TYPES)[number];

/** Union type of all webhook delivery event types */
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Union type of all step execution event types */
export type StepEventType = (typeof STEP_EVENT_TYPES)[number];

/** Union type of all log event types */
export type LogEventType = (typeof LOG_EVENT_TYPES)[number];
