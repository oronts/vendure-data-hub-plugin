import type { Type } from '@vendure/common/lib/shared-types';
import {
    AccountRegistrationEvent,
    AssetEvent,
    CollectionModificationEvent,
    CustomerAddressEvent,
    CustomerEvent,
    OrderPlacedEvent,
    OrderStateTransitionEvent,
    PaymentStateTransitionEvent,
    ProductEvent,
    ProductVariantEvent,
    ProductVariantPriceEvent,
    RefundStateTransitionEvent,
    StockMovementEvent,
    VendureEvent,
} from '@vendure/core';
import type { ID } from '@vendure/core';
import {
    VENDURE_EVENT_TYPES,
    type PipelineDefinition,
    type VendureEventType,
} from '../../../shared/types';
import type { Pipeline } from '../../entities/pipeline';
import { TriggerType } from '../../constants/enums';
import { findEnabledTriggersByType, parseTriggerConfig } from '../../utils';

export const VENDURE_EVENT_CLASSES = {
    ProductEvent,
    ProductVariantEvent,
    ProductVariantPriceEvent,
    CollectionModificationEvent,
    AssetEvent,
    StockMovementEvent,
    OrderStateTransitionEvent,
    OrderPlacedEvent,
    RefundStateTransitionEvent,
    PaymentStateTransitionEvent,
    CustomerEvent,
    AccountRegistrationEvent,
    CustomerAddressEvent,
} satisfies Record<VendureEventType, Type<VendureEvent>>;

export interface DiscoveredEventTrigger {
    pipelineId: ID;
    pipelineCode: string;
    triggerKey: string;
    event: VendureEventType;
}

interface EventPayload {
    ctx?: { channelId?: unknown };
    entity?: unknown;
    type?: unknown;
    collection?: unknown;
    productVariantIds?: unknown;
    stockMovements?: unknown;
    fromState?: unknown;
    toState?: unknown;
    order?: unknown;
    refund?: unknown;
    payment?: unknown;
    user?: unknown;
}

type SeedRecord = Record<string, unknown>;

const ENTITY_EVENTS = new Set<VendureEventType>([
    'ProductEvent',
    'ProductVariantEvent',
    'ProductVariantPriceEvent',
    'AssetEvent',
    'CustomerEvent',
    'CustomerAddressEvent',
]);

const TRANSITION_EVENTS = new Set<VendureEventType>([
    'OrderStateTransitionEvent',
    'OrderPlacedEvent',
    'RefundStateTransitionEvent',
    'PaymentStateTransitionEvent',
]);

const SUPPORTED_EVENT_SET = new Set<string>(VENDURE_EVENT_TYPES);

export function isVendureEventType(value: unknown): value is VendureEventType {
    return typeof value === 'string' && SUPPORTED_EVENT_SET.has(value);
}

export function getVendureEventType(vendureEvent: VendureEvent): VendureEventType {
    for (const eventType of VENDURE_EVENT_TYPES) {
        if (vendureEvent.constructor === VENDURE_EVENT_CLASSES[eventType]) {
            return eventType;
        }
    }
    throw new Error(`Unsupported Vendure event class: ${vendureEvent.constructor.name}`);
}

export function discoverEventTriggers(pipeline: Pick<Pipeline, 'id' | 'code' | 'definition'>): DiscoveredEventTrigger[] {
    const definition = pipeline.definition as PipelineDefinition | undefined;
    return findEnabledTriggersByType(definition, TriggerType.EVENT).flatMap(trigger => {
        const event = parseTriggerConfig(trigger)?.event;
        return isVendureEventType(event)
            ? [{
                pipelineId: pipeline.id,
                pipelineCode: pipeline.code,
                triggerKey: trigger.key,
                event,
            }]
            : [];
    });
}

export function matchesVendureEvent(configuredEvent: VendureEventType, receivedEvent: VendureEventType): boolean {
    return configuredEvent === receivedEvent;
}

function idOf(value: unknown): string | undefined {
    if (!value || typeof value !== 'object' || !('id' in value)) return undefined;
    const id = (value as { id?: unknown }).id;
    if (typeof id !== 'string' && typeof id !== 'number') return undefined;
    const normalized = String(id).trim();
    return normalized || undefined;
}

function idsOf(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap(item => {
        const id = idOf(item);
        if (id) return [id];
        if (typeof item === 'string' || typeof item === 'number') {
            const normalized = String(item).trim();
            return normalized ? [normalized] : [];
        }
        return [];
    });
}

function operationOf(value: unknown): 'CREATE' | 'UPDATE' | 'DELETE' {
    if (value === 'created') return 'CREATE';
    if (value === 'deleted') return 'DELETE';
    return 'UPDATE';
}

function baseRecord(event: VendureEventType, payload: EventPayload): SeedRecord {
    const channelId = payload.ctx?.channelId;
    return {
        event,
        ...(typeof channelId === 'string' || typeof channelId === 'number'
            ? { channelId: String(channelId) }
            : {}),
    };
}

function entitySeedRecord(
    event: VendureEventType,
    payload: EventPayload,
    entity: unknown,
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
): SeedRecord | undefined {
    const id = idOf(entity);
    if (!id) return undefined;
    const record = entity as { variant?: unknown; channelId?: unknown };
    const productVariantId = idOf(record.variant);
    const priceChannelId = record.channelId;
    return {
        ...baseRecord(event, payload),
        id,
        ...(event === 'ProductVariantPriceEvent' && productVariantId ? { productVariantId } : {}),
        ...(event === 'ProductVariantPriceEvent' &&
            (typeof priceChannelId === 'string' || typeof priceChannelId === 'number')
            ? { priceChannelId: String(priceChannelId) }
            : {}),
        __operation: operation,
    };
}

function entityEventSeeds(event: VendureEventType, payload: EventPayload): SeedRecord[] {
    const entities = Array.isArray(payload.entity) ? payload.entity : [payload.entity];
    const operation = operationOf(payload.type);
    const seeds = entities.flatMap(entity => {
        const seed = entitySeedRecord(event, payload, entity, operation);
        return seed ? [seed] : [];
    });
    return seeds.length > 0
        ? seeds
        : [{ ...baseRecord(event, payload), __operation: operation }];
}

function transitionEventSeed(event: VendureEventType, payload: EventPayload): SeedRecord {
    const subject = event === 'RefundStateTransitionEvent'
        ? payload.refund
        : event === 'PaymentStateTransitionEvent'
            ? payload.payment
            : payload.order;
    const subjectId = idOf(subject);
    const orderId = idOf(payload.order);
    return {
        ...baseRecord(event, payload),
        ...(subjectId ? { id: subjectId } : {}),
        ...((event === 'RefundStateTransitionEvent' || event === 'PaymentStateTransitionEvent') && orderId
            ? { orderId }
            : {}),
        fromState: String(payload.fromState ?? ''),
        toState: String(payload.toState ?? ''),
        __operation: 'UPDATE',
    };
}

function collectionEventSeeds(event: VendureEventType, payload: EventPayload): SeedRecord[] {
    const collectionId = idOf(payload.collection);
    return [{
        ...baseRecord(event, payload),
        ...(collectionId ? { id: collectionId } : {}),
        productVariantIds: idsOf(payload.productVariantIds),
        __operation: 'UPDATE',
    }];
}

function stockMovementEventSeeds(event: VendureEventType, payload: EventPayload): SeedRecord[] {
    const movements = Array.isArray(payload.stockMovements) ? payload.stockMovements : [];
    const seeds = movements.map(movement => {
        const record = movement as {
            type?: unknown;
            productVariant?: unknown;
            stockLocationId?: unknown;
        };
        const id = idOf(movement);
        const productVariantId = idOf(record.productVariant);
        return {
            ...baseRecord(event, payload),
            ...(id ? { id } : {}),
            ...(productVariantId ? { productVariantId } : {}),
            ...(typeof record.stockLocationId === 'string' || typeof record.stockLocationId === 'number'
                ? { stockLocationId: String(record.stockLocationId) }
                : {}),
            movementType: String(record.type ?? ''),
            __operation: 'CREATE',
        };
    });
    return seeds.length > 0
        ? seeds
        : [{ ...baseRecord(event, payload), __operation: 'CREATE' }];
}

function accountRegistrationEventSeeds(event: VendureEventType, payload: EventPayload): SeedRecord[] {
    const userId = idOf(payload.user);
    return [{
        ...baseRecord(event, payload),
        ...(userId ? { id: userId } : {}),
        __operation: 'CREATE',
    }];
}

export function createEventSeedRecords(event: VendureEventType, vendureEvent: VendureEvent): SeedRecord[] {
    const payload = vendureEvent as unknown as EventPayload;
    if (ENTITY_EVENTS.has(event)) return entityEventSeeds(event, payload);
    if (event === 'CollectionModificationEvent') return collectionEventSeeds(event, payload);
    if (event === 'StockMovementEvent') return stockMovementEventSeeds(event, payload);
    if (TRANSITION_EVENTS.has(event)) return [transitionEventSeed(event, payload)];
    return accountRegistrationEventSeeds(event, payload);
}
