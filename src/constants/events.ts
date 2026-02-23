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
 * Step lifecycle events use PascalCase (StepStarted, etc.)
 * Record-level domain events use UPPER_CASE (RECORD_EXTRACTED, etc.)
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
    'RECORD_EXPORTED',
    'RECORD_INDEXED',
    'FEED_GENERATED',
] as const;

/**
 * Gate approval event types for human-in-the-loop workflows
 *
 * Note: These use PascalCase for consistency with Vendure event naming conventions
 */
export const GATE_EVENT_TYPES = [
    'GateApprovalRequested',
    'GateApproved',
    'GateRejected',
    'GateTimeout',
] as const;

/**
 * Trigger lifecycle event types for pipeline trigger tracking
 *
 * Note: These use PascalCase for consistency with Vendure event naming conventions
 */
export const TRIGGER_EVENT_TYPES = [
    'TriggerFired',
    'ScheduleActivated',
    'ScheduleDeactivated',
] as const;

/**
 * Log event types for real-time log streaming
 *
 * Note: These use PascalCase for consistency with Vendure event naming conventions
 */
export const LOG_EVENT_TYPES = [
    'LogAdded',
] as const;

/**
 * Pipeline lifecycle event types for CRUD and status transitions
 *
 * Note: These use PascalCase for consistency with Vendure event naming conventions
 */
export const PIPELINE_EVENT_TYPES = [
    'PipelineCreated',
    'PipelineUpdated',
    'PipelineDeleted',
    'PipelinePublished',
    'PipelineArchived',
] as const;

/**
 * Internal execution event types emitted by pipeline executors for observability.
 * These are runtime-only events (not part of the public subscription API).
 *
 * Note: These use PascalCase for consistency with Vendure event naming conventions
 */
export const INTERNAL_EVENT_TYPES = [
    'PIPELINE_STARTED',
    'PipelineStepSkipped',
    'PipelinePaused',
    'RECORD_REJECTED',
    'RECORD_DEAD_LETTERED',
] as const;

/**
 * Vendure domain events that can trigger pipelines via EVENT trigger type.
 * This is the single source of truth for event metadata (including category for UI grouping).
 */
export const VENDURE_EVENTS = [
    { event: 'ProductEvent', label: 'Product Changed', description: 'Any product change', category: 'Catalog' },
    { event: 'ProductVariantEvent', label: 'Variant Changed', description: 'Any variant change', category: 'Catalog' },
    { event: 'ProductVariantPriceEvent', label: 'Price Changed', description: 'Variant price updated', category: 'Catalog' },
    { event: 'CollectionModificationEvent', label: 'Collection Modified', description: 'Collection changed', category: 'Catalog' },
    { event: 'AssetEvent', label: 'Asset Changed', description: 'Asset created/updated', category: 'Catalog' },
    { event: 'StockMovementEvent', label: 'Stock Movement', description: 'Stock level changed', category: 'Inventory' },
    { event: 'OrderStateTransitionEvent', label: 'Order State Changed', description: 'Order transitioned', category: 'Orders' },
    { event: 'OrderPlacedEvent', label: 'Order Placed', description: 'New order placed', category: 'Orders' },
    { event: 'RefundStateTransitionEvent', label: 'Refund State Changed', description: 'Refund transitioned', category: 'Orders' },
    { event: 'PaymentStateTransitionEvent', label: 'Payment State Changed', description: 'Payment transitioned', category: 'Orders' },
    { event: 'CustomerEvent', label: 'Customer Changed', description: 'Customer created/updated', category: 'Customers' },
    { event: 'AccountRegistrationEvent', label: 'Account Registered', description: 'New account registered', category: 'Customers' },
    { event: 'CustomerAddressEvent', label: 'Address Changed', description: 'Customer address updated', category: 'Customers' },
] as const;

/** Union type of all pipeline run event types */
export type RunEventType = (typeof RUN_EVENT_TYPES)[number];

/** Union type of all webhook delivery event types */
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Union type of all step execution event types */
export type StepEventType = (typeof STEP_EVENT_TYPES)[number];

/** Union type of all gate approval event types */
export type GateEventType = (typeof GATE_EVENT_TYPES)[number];

/** Union type of all trigger lifecycle event types */
export type TriggerEventType = (typeof TRIGGER_EVENT_TYPES)[number];

/** Union type of all log event types */
export type LogEventType = (typeof LOG_EVENT_TYPES)[number];

/** Union type of all pipeline lifecycle event types */
export type PipelineEventType = (typeof PIPELINE_EVENT_TYPES)[number];
