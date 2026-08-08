import { describe, expect, it } from 'vitest';
import type { VendureEvent } from '@vendure/core';
import { VENDURE_EVENT_TYPES, type PipelineDefinition, type VendureEventType } from '../../../shared/types';
import { VENDURE_EVENTS } from '../../constants/events';
import type { Pipeline } from '../../entities/pipeline';
import {
    createEventSeedRecords,
    discoverEventTriggers,
    matchesVendureEvent,
    VENDURE_EVENT_CLASSES,
} from './event-trigger.contract';

function asVendureEvent(payload: Record<string, unknown>): VendureEvent {
    return payload as unknown as VendureEvent;
}

describe('Vendure EVENT trigger contract', () => {
    it('binds every advertised event to an installed Vendure event class', () => {
        expect(VENDURE_EVENTS.map(option => option.event)).toEqual(VENDURE_EVENT_TYPES);
        expect(Object.keys(VENDURE_EVENT_CLASSES)).toEqual(VENDURE_EVENT_TYPES);
        for (const event of VENDURE_EVENT_TYPES) {
            expect(VENDURE_EVENT_CLASSES[event].name).toBe(event);
        }
    });

    it('discovers every enabled exact-class trigger and ignores invalid or disabled entries', () => {
        const definition: PipelineDefinition = {
            version: 1,
            steps: [
                { key: 'product', type: 'TRIGGER', config: { type: 'EVENT', event: 'ProductEvent' } },
                { key: 'order', type: 'TRIGGER', config: { type: 'EVENT', event: 'OrderPlacedEvent' } },
                { key: 'disabled', type: 'TRIGGER', config: { type: 'EVENT', event: 'AssetEvent', enabled: false } },
                { key: 'legacy', type: 'TRIGGER', config: { type: 'EVENT', event: 'product.*' } },
            ],
        };
        const pipeline = {
            id: 7,
            code: 'events',
            revisionId: 11,
            definition,
        } as Pick<Pipeline, 'id' | 'code' | 'definition'> & { revisionId: number };

        expect(discoverEventTriggers(pipeline)).toEqual([
            { pipelineId: 7, pipelineCode: 'events', revisionId: 11, triggerKey: 'product', event: 'ProductEvent' },
            { pipelineId: 7, pipelineCode: 'events', revisionId: 11, triggerKey: 'order', event: 'OrderPlacedEvent' },
        ]);
    });

    it('matches exact Vendure class names only', () => {
        expect(matchesVendureEvent('ProductEvent', 'ProductEvent')).toBe(true);
        expect(matchesVendureEvent('ProductEvent', 'ProductVariantEvent')).toBe(false);
    });

    it.each([
        'ProductEvent',
        'ProductVariantEvent',
        'ProductVariantPriceEvent',
        'AssetEvent',
        'CustomerEvent',
        'CustomerAddressEvent',
    ] satisfies VendureEventType[])('creates one safe record per entity for %s', event => {
        const records = createEventSeedRecords(event, asVendureEvent({
            ctx: { channelId: 2 },
            type: 'updated',
            entity: [
                { id: 11, name: 'private value', emailAddress: 'private@example.com' },
                { id: 12, name: 'private value 2' },
            ],
        }));

        expect(records).toEqual([
            { event, channelId: '2', id: '11', __operation: 'UPDATE' },
            { event, channelId: '2', id: '12', __operation: 'UPDATE' },
        ]);
        expect(JSON.stringify(records)).not.toContain('private');
    });

    it('adds safe variant and price-channel IDs for price events', () => {
        expect(createEventSeedRecords('ProductVariantPriceEvent', asVendureEvent({
            type: 'created',
            entity: [{
                id: 30,
                price: 1999,
                channelId: 4,
                variant: { id: 20, sku: 'PRIVATE-SKU' },
            }],
        }))).toEqual([{
            event: 'ProductVariantPriceEvent',
            id: '30',
            productVariantId: '20',
            priceChannelId: '4',
            __operation: 'CREATE',
        }]);
    });

    it('seeds collection membership with collection and affected variant IDs only', () => {
        expect(createEventSeedRecords('CollectionModificationEvent', asVendureEvent({
            collection: { id: 4, name: 'Private collection name' },
            productVariantIds: [8, '9'],
        }))).toEqual([{
            event: 'CollectionModificationEvent',
            id: '4',
            productVariantIds: ['8', '9'],
            __operation: 'UPDATE',
        }]);
    });

    it('creates safe stock movement records without quantities or entity data', () => {
        const records = createEventSeedRecords('StockMovementEvent', asVendureEvent({
            stockMovements: [{
                id: 31,
                type: 'ADJUSTMENT',
                quantity: 999,
                productVariant: { id: 21, sku: 'SECRET-SKU' },
                stockLocationId: 5,
            }],
        }));

        expect(records).toEqual([{
            event: 'StockMovementEvent',
            id: '31',
            productVariantId: '21',
            stockLocationId: '5',
            movementType: 'ADJUSTMENT',
            __operation: 'CREATE',
        }]);
        expect(JSON.stringify(records)).not.toContain('999');
        expect(JSON.stringify(records)).not.toContain('SECRET-SKU');
    });

    it.each([
        ['OrderStateTransitionEvent', 'order'],
        ['OrderPlacedEvent', 'order'],
        ['RefundStateTransitionEvent', 'refund'],
        ['PaymentStateTransitionEvent', 'payment'],
    ] satisfies Array<[VendureEventType, 'order' | 'refund' | 'payment']>)(
        'seeds IDs and states for %s',
        (event, subjectField) => {
            const records = createEventSeedRecords(event, asVendureEvent({
                [subjectField]: { id: 44, code: 'PRIVATE' },
                order: { id: 45, code: 'ORDER-PRIVATE' },
                fromState: 'Pending',
                toState: 'Settled',
            }));

            expect(records[0]).toMatchObject({
                event,
                id: subjectField === 'order' ? '45' : '44',
                fromState: 'Pending',
                toState: 'Settled',
                __operation: 'UPDATE',
            });
            if (subjectField !== 'order') {
                expect(records[0].orderId).toBe('45');
            }
            expect(JSON.stringify(records)).not.toContain('PRIVATE');
        },
    );

    it('seeds account registration with only the user ID', () => {
        expect(createEventSeedRecords('AccountRegistrationEvent', asVendureEvent({
            user: { id: 77, identifier: 'private@example.com' },
        }))).toEqual([{
            event: 'AccountRegistrationEvent',
            id: '77',
            __operation: 'CREATE',
        }]);
    });
});
