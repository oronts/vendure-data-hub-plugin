import { describe, expect, it } from 'vitest';
import { PARALLEL_EXECUTION } from '../../../shared/constants';
import { createPipeline } from './pipeline-builder';

describe('documented pipeline examples', () => {
    it('places registry bindings on extract and validate steps', () => {
        const definition = createPipeline()
            .name('Schema-bound import')
            .extract('source', {
                adapterCode: 'inMemory',
                schemaRef: {
                    schemaId: 'catalog.product',
                    version: '1.0.0',
                },
            })
            .validate('contract', {
                schemaRef: {
                    schemaId: 'catalog.product',
                    version: '1.0.0',
                },
            })
            .build();

        expect(definition.steps).toEqual([
            expect.objectContaining({
                key: 'source',
                schemaRef: {
                    schemaId: 'catalog.product',
                    version: '1.0.0',
                },
            }),
            expect.objectContaining({
                key: 'contract',
                schemaRef: {
                    schemaId: 'catalog.product',
                    version: '1.0.0',
                },
            }),
        ]);
    });

    it('builds an authenticated webhook product pipeline', () => {
        const definition = createPipeline()
            .name('Supplier webhook')
            .capabilities({ requires: ['UpdateCatalog'] })
            .trigger('supplier-event', {
                type: 'WEBHOOK',
                authentication: 'HMAC',
                secretCode: 'supplier-webhook-secret',
            })
            .transform('normalize', {
                operators: [{
                    op: 'map',
                    args: {
                        mapping: {
                            sku: 'externalSku',
                            name: 'title',
                        },
                    },
                }],
            })
            .load('products', {
                adapterCode: 'productUpsert',
                strategy: 'UPSERT',
                skuField: 'sku',
                nameField: 'name',
            })
            .edge('supplier-event', 'normalize')
            .edge('normalize', 'products')
            .build();

        expect(definition.steps).toHaveLength(3);
        expect(definition.edges).toHaveLength(2);
    });

    it('preserves the documented feed price unit contract', () => {
        const definition = createPipeline()
            .name('External product feed')
            .trigger('manual', { type: 'MANUAL' })
            .feed('merchant-feed', {
                adapterCode: 'googleMerchant',
                outputPath: 'feeds/products.xml',
                currency: 'EUR',
                priceField: 'price',
                priceUnit: 'MAJOR',
            })
            .edge('manual', 'merchant-feed')
            .build();

        expect(definition.steps[1].config).toMatchObject({
            priceField: 'price',
            priceUnit: 'MAJOR',
        });
    });

    it('builds the canonical message queue trigger and sink contract', () => {
        const definition = createPipeline()
            .name('Queue relay')
            .trigger('incoming', {
                type: 'MESSAGE',
                message: {
                    queueType: 'RABBITMQ_AMQP',
                    connectionCode: 'rabbitmq-main',
                    queueName: 'orders.incoming',
                    ackMode: 'MANUAL',
                },
            })
            .extract('message', { adapterCode: 'inMemory' })
            .sink('outgoing', {
                adapterCode: 'queueProducer',
                queueType: 'RABBITMQ_AMQP',
                connectionCode: 'rabbitmq-main',
                queueName: 'orders.processed',
                routingKey: 'order.processed',
                persistent: true,
            })
            .edge('incoming', 'message')
            .edge('message', 'outgoing')
            .build();

        expect(definition.steps[0].config).toMatchObject({
            message: {
                queueType: 'RABBITMQ_AMQP',
                queueName: 'orders.incoming',
            },
        });
        expect(definition.steps[2].config).toMatchObject({
            queueType: 'RABBITMQ_AMQP',
            queueName: 'orders.processed',
        });
    });

    it('builds an internal message trigger without a connection', () => {
        const definition = createPipeline()
            .name('Internal queue consumer')
            .trigger('incoming', {
                type: 'MESSAGE',
                message: {
                    queueType: 'INTERNAL',
                    queueName: 'catalog.updates',
                },
            })
            .transform('tag-source', {
                operators: [{ op: 'set', args: { path: 'source', value: 'internal' } }],
            })
            .edge('incoming', 'tag-source')
            .build();

        expect(definition.steps[0].config).toEqual({
            type: 'MESSAGE',
            message: {
                queueType: 'INTERNAL',
                queueName: 'catalog.updates',
            },
        });
    });

    it('builds the active rule-based validation contract', () => {
        const definition = createPipeline()
            .name('Validated import')
            .validate('validate-products', {
                errorHandlingMode: 'ACCUMULATE',
                rules: [{
                    type: 'business',
                    spec: {
                        field: 'sku',
                        required: true,
                        minLength: 3,
                    },
                }],
            })
            .build();

        expect(definition.steps[0].config).toEqual({
            errorHandlingMode: 'ACCUMULATE',
            rules: [{
                type: 'business',
                spec: {
                    field: 'sku',
                    required: true,
                    minLength: 3,
                },
            }],
        });
    });

    it('emits load channel overrides in the canonical step context', () => {
        const definition = createPipeline()
            .name('Channel-scoped import')
            .load('products', {
                adapterCode: 'productUpsert',
                strategy: 'UPSERT',
                channelStrategy: 'MULTI',
                channelIds: ['2', '3'],
                validationMode: 'STRICT',
            })
            .build();

        expect(definition.steps[0]).toMatchObject({
            adapterCode: 'productUpsert',
            config: { strategy: 'UPSERT' },
            context: {
                channelStrategy: 'MULTI',
                channelIds: ['2', '3'],
                validationMode: 'STRICT',
            },
        });
        expect(definition.steps[0].config).not.toHaveProperty('channelStrategy');
        expect(definition.steps[0].config).not.toHaveProperty('channelIds');
        expect(definition.steps[0].config).not.toHaveProperty('validationMode');
    });

    it('emits enrichment execution controls as step metadata', () => {
        const definition = createPipeline()
            .name('Bounded enrichment')
            .enrich('defaults', {
                sourceType: 'STATIC',
                defaults: { currency: 'EUR' },
                throughput: { concurrency: 2 },
                async: true,
            })
            .build();

        expect(definition.steps[0]).toMatchObject({
            config: {
                sourceType: 'STATIC',
                defaults: { currency: 'EUR' },
            },
            throughput: { concurrency: 2 },
            async: true,
        });
        expect(definition.steps[0].config).not.toHaveProperty('throughput');
        expect(definition.steps[0].config).not.toHaveProperty('async');
    });

    it('connects the documented route default target to the default branch', () => {
        const definition = createPipeline()
            .name('Categorized import')
            .route('by-category', {
                branches: [{
                    name: 'featured',
                    when: [{ field: 'featured', cmp: 'eq', value: true }],
                }],
                defaultTo: 'standard-products',
            })
            .transform('featured-products', { operators: [] })
            .transform('standard-products', { operators: [] })
            .edge('by-category', 'featured-products', 'featured')
            .edge('by-category', 'standard-products')
            .build();

        expect(definition.steps[0].config).not.toHaveProperty('defaultTo');
        expect(definition.edges).toContainEqual({
            from: 'by-category',
            to: 'standard-products',
            branch: 'default',
        });
    });

    it('rejects a route default target without a matching edge', () => {
        expect(() => createPipeline()
            .name('Incomplete route')
            .route('by-category', {
                branches: [{
                    name: 'featured',
                    when: [{ field: 'featured', cmp: 'eq', value: true }],
                }],
                defaultTo: 'standard-products',
            })
            .build()).toThrow(
            'Route "by-category" default target "standard-products" requires a matching edge',
        );
    });

    it('validates built-in enrichment modes while preserving custom adapters', () => {
        expect(() => createPipeline().enrich('invalid-static', {
            sourceType: 'STATIC',
        })).toThrow('STATIC enrichment requires');

        expect(() => createPipeline().enrich('static', {
            set: { source: 'catalog-sync' },
        })).not.toThrow();
        expect(() => createPipeline().enrich('http', {
            sourceType: 'HTTP',
            url: 'https://api.example.com/{{sku}}',
        })).not.toThrow();
        expect(() => createPipeline().enrich('vendure', {
            sourceType: 'VENDURE',
            entityType: 'PRODUCT_VARIANT',
            sourceField: 'sku',
            lookupField: 'sku',
        })).not.toThrow();
        expect(() => createPipeline().enrich('custom', {
            adapterCode: 'custom-enricher',
        })).not.toThrow();
    });
    it('rejects unsafe parallel execution limits in the SDK builder', () => {
        expect(() => createPipeline().parallel({
            maxConcurrentSteps: 1.5,
        })).toThrow('maxConcurrentSteps must be an integer');
        expect(() => createPipeline().parallel({
            maxConcurrentSteps: PARALLEL_EXECUTION.MAX_CONCURRENT_STEPS + 1,
        })).toThrow('maxConcurrentSteps must be an integer');
    });
});
