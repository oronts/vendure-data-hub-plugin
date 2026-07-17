import { describe, expect, it } from 'vitest';
import {
    LOADER_ADAPTERS,
    LOADER_HANDLER_PROVIDERS,
    LOADER_HANDLER_REGISTRY,
} from './loader-handler-registry';
import { LOADER_DEFINITION_REGISTRY } from './registry/loader-adapter-definitions';
import { LOADER_HANDLER_MAP } from './registry/loader-handler-map';

const EXPECTED_LOADER_CODES = [
    'productUpsert',
    'variantUpsert',
    'customerUpsert',
    'orderUpsert',
    'orderNote',
    'stockAdjust',
    'applyCoupon',
    'collectionUpsert',
    'promotionUpsert',
    'orderTransition',
    'assetAttach',
    'assetImport',
    'facetUpsert',
    'facetValueUpsert',
    'restPost',
    'graphqlMutation',
    'taxRateUpsert',
    'paymentMethodUpsert',
    'channelUpsert',
    'shippingMethodUpsert',
    'customerGroupUpsert',
    'stockLocationUpsert',
    'inventoryAdjust',
    'entityDeletion',
] as const;

describe('loader handler registry contract', () => {
    it('exposes every supported loader in canonical order', () => {
        expect([...LOADER_HANDLER_REGISTRY.keys()]).toEqual(EXPECTED_LOADER_CODES);
        expect([...LOADER_DEFINITION_REGISTRY.keys()]).toEqual(EXPECTED_LOADER_CODES);
        expect([...LOADER_HANDLER_MAP.keys()]).toEqual(EXPECTED_LOADER_CODES);
    });

    it('composes each public entry from its canonical definition and handler', () => {
        for (const [code, entry] of LOADER_HANDLER_REGISTRY) {
            expect(entry.definition).toBe(LOADER_DEFINITION_REGISTRY.get(code)?.definition);
            expect(entry.handler).toBe(LOADER_HANDLER_MAP.get(code));
        }
    });

    it('keeps registry codes, definition codes, and providers unique', () => {
        const codes = [...LOADER_HANDLER_REGISTRY.keys()];
        const handlers = [...LOADER_HANDLER_REGISTRY.values()].map(entry => entry.handler);
        const definitions = [...LOADER_HANDLER_REGISTRY.values()].map(entry => entry.definition);
        const definitionCodes = LOADER_ADAPTERS.map(definition => definition.code);

        expect(new Set(codes).size).toBe(codes.length);
        expect(definitionCodes).toEqual(codes);
        expect(new Set(definitionCodes).size).toBe(definitionCodes.length);
        expect(new Set(handlers).size).toBe(handlers.length);
        expect(LOADER_HANDLER_PROVIDERS).toEqual(handlers);
        expect(new Set(definitions).size).toBe(definitions.length);
        expect(LOADER_ADAPTERS).toEqual(definitions);
    });
});
