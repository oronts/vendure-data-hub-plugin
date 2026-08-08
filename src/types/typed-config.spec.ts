import { describe, expect, it } from 'vitest';
import { LOADER_CODES } from './loader-configs';
import {
    deriveCapabilities,
    Loaders,
    loadStep,
    type TypedLoaderConfig,
} from './typed-config';
import { LOADER_DEFINITION_REGISTRY } from '../runtime/executors/loaders/registry/loader-adapter-definitions';

const BUILT_IN_LOADER_CONFIGS = [
    Loaders.productUpsert({}),
    Loaders.variantUpsert({}),
    Loaders.customerUpsert({ emailField: 'email' }),
    Loaders.orderUpsert({}),
    Loaders.orderNote({ noteField: 'note' }),
    Loaders.stockAdjust({ skuField: 'sku', stockByLocationField: 'stockByLocation' }),
    Loaders.applyCoupon({ couponField: 'coupon' }),
    Loaders.collectionUpsert({}),
    Loaders.promotionUpsert({ codeField: 'code', actionsField: 'actions' }),
    Loaders.orderTransition({ state: 'PaymentSettled' }),
    Loaders.assetAttach({
        entity: 'PRODUCT',
        slugField: 'slug',
        assetIdField: 'assetId',
    }),
    Loaders.assetImport({ sourceUrlField: 'url' }),
    Loaders.facetUpsert({ codeField: 'code', nameField: 'name' }),
    Loaders.facetValueUpsert({
        facetCodeField: 'facetCode',
        codeField: 'code',
        nameField: 'name',
    }),
    Loaders.restPost({ endpoint: 'https://example.com', method: 'POST' }),
    Loaders.graphqlMutation({
        endpoint: 'https://example.com/graphql',
        mutation: 'mutation Sync($input: JSON!) { sync(input: $input) }',
        variableMapping: { input: 'record' },
    }),
    Loaders.taxRateUpsert({
        nameField: 'name',
        valueField: 'value',
        taxCategoryCodeField: 'taxCategory',
        zoneCodeField: 'zone',
    }),
    Loaders.paymentMethodUpsert({
        nameField: 'name',
        codeField: 'code',
        handlerField: 'handler',
    }),
    Loaders.channelUpsert({
        codeField: 'code',
        defaultLanguageCodeField: 'language',
        defaultCurrencyCodeField: 'currency',
    }),
    Loaders.shippingMethodUpsert({
        nameField: 'name',
        codeField: 'code',
        fulfillmentHandlerField: 'fulfillmentHandler',
        calculatorField: 'calculator',
    }),
    Loaders.customerGroupUpsert({ nameField: 'name' }),
    Loaders.stockLocationUpsert({ nameField: 'name' }),
    Loaders.inventoryAdjust({
        skuField: 'sku',
        stockOnHandField: 'stockOnHand',
    }),
    Loaders.entityDeletion({}),
] satisfies TypedLoaderConfig[];

describe('typed loader factories', () => {
    it('covers every canonical built-in loader in registry order', () => {
        expect([...LOADER_DEFINITION_REGISTRY.keys()]).toEqual(LOADER_CODES);
        expect(Object.keys(Loaders).filter(code => code !== 'custom')).toEqual(LOADER_CODES);
        expect(BUILT_IN_LOADER_CONFIGS.map(config => config.adapterCode)).toEqual(LOADER_CODES);
    });

    it('derives the same permission declared by each runtime definition', () => {
        for (const config of BUILT_IN_LOADER_CONFIGS) {
            const definition = LOADER_DEFINITION_REGISTRY.get(config.adapterCode)?.definition;
            expect(definition).toBeDefined();
            expect(deriveCapabilities([loadStep('load', config)]).requires)
                .toEqual(definition?.requires);
        }
    });

    it('derives every write domain and permission once', () => {
        const steps = BUILT_IN_LOADER_CONFIGS.map((config, index) =>
            loadStep(`load-${index}`, config));

        expect(deriveCapabilities(steps)).toEqual({
            requires: [
                'UpdateCatalog',
                'UpdateCustomer',
                'UpdateOrder',
                'UpdatePromotion',
                'UpdateDataHubSettings',
                'UpdateSettings',
                'UpdateShippingMethod',
            ],
            writes: [
                'CATALOG',
                'CUSTOMERS',
                'ORDERS',
                'INVENTORY',
                'PROMOTIONS',
                'CUSTOM',
            ],
        });
    });

    it('keeps factory adapter codes canonical for untyped callers', () => {
        expect(Loaders.productUpsert({
            adapterCode: 'custom' as never,
        } as never).adapterCode).toBe('productUpsert');
        expect(Loaders.custom('warehouseLoader', {
            adapterCode: 'custom',
            batchSize: 50,
        }).adapterCode).toBe('warehouseLoader');
    });

    it('does not invent capabilities for custom loaders', () => {
        expect(deriveCapabilities([
            loadStep('custom', Loaders.custom('warehouseLoader', {})),
        ])).toEqual({});
    });

    it('derives inventory writes when a catalog loader maps stock', () => {
        expect(deriveCapabilities([
            loadStep('variants', Loaders.variantUpsert({
                stockField: 'availableStock',
            })),
        ])).toEqual({
            requires: ['UpdateCatalog'],
            writes: ['CATALOG', 'INVENTORY'],
        });
    });

    it('derives deletion permissions and domains from the configured entity', () => {
        expect(deriveCapabilities([
            loadStep('customers', Loaders.entityDeletion({
                entityType: 'customer',
            })),
            loadStep('promotions', Loaders.entityDeletion({
                entityType: 'promotion',
            })),
            loadStep('stock-locations', Loaders.entityDeletion({
                entityType: 'stock-location',
            })),
        ])).toEqual({
            requires: ['UpdateCustomer', 'UpdatePromotion', 'UpdateCatalog'],
            writes: ['CUSTOMERS', 'PROMOTIONS', 'INVENTORY'],
        });
    });
});
