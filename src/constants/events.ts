import { VENDURE_EVENT_TYPES, type VendureEventType } from '../../shared/types';

/**
 * Pipeline run-level domain event types.
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
    'PIPELINE_COMPLETED',
    'PIPELINE_FAILED',
    'PipelineStepSkipped',
    'PipelinePaused',
    'RECORD_REJECTED',
    'RECORD_DEAD_LETTERED',
] as const;

/** Metadata for the Vendure domain events supported by EVENT triggers. */
const VENDURE_EVENT_METADATA = {
    ProductEvent: { label: 'Product Changed', description: 'Product created, updated, or deleted', category: 'Catalog' },
    ProductVariantEvent: { label: 'Variant Changed', description: 'Variant created, updated, or deleted', category: 'Catalog' },
    ProductVariantPriceEvent: { label: 'Price Changed', description: 'Variant price created, updated, or deleted', category: 'Catalog' },
    CollectionModificationEvent: { label: 'Collection Modified', description: 'Collection membership changed', category: 'Catalog' },
    AssetEvent: { label: 'Asset Changed', description: 'Asset created, updated, or deleted', category: 'Catalog' },
    StockMovementEvent: { label: 'Stock Movement', description: 'Stock movement created', category: 'Inventory' },
    OrderStateTransitionEvent: { label: 'Order State Changed', description: 'Order transitioned to another state', category: 'Orders' },
    OrderPlacedEvent: { label: 'Order Placed', description: 'Order reached its configured placed state', category: 'Orders' },
    RefundStateTransitionEvent: { label: 'Refund State Changed', description: 'Refund transitioned to another state', category: 'Orders' },
    PaymentStateTransitionEvent: { label: 'Payment State Changed', description: 'Payment transitioned to another state', category: 'Orders' },
    CustomerEvent: { label: 'Customer Changed', description: 'Customer created, updated, or deleted', category: 'Customers' },
    AccountRegistrationEvent: { label: 'Account Registered', description: 'Customer account registered', category: 'Customers' },
    CustomerAddressEvent: { label: 'Address Changed', description: 'Customer address created, updated, or deleted', category: 'Customers' },
} as const satisfies Record<VendureEventType, { label: string; description: string; category: string }>;

export const VENDURE_EVENTS = VENDURE_EVENT_TYPES.map(event => ({
    event,
    ...VENDURE_EVENT_METADATA[event],
}));

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

/** Union type of all pipeline lifecycle event types */
export type PipelineEventType = (typeof PIPELINE_EVENT_TYPES)[number];
