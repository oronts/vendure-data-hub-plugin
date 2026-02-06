import { Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EntityLoader, LoaderRegistry, EntityFieldSchema, TargetOperation } from '../../types/index';
import { VendureEntityType as VendureEntityTypeUnion } from '../../types/index';
import { VendureEntityType } from '../../constants/enums';
import { ProductVariantLoader } from '../product-variant';
import { ProductLoader } from '../product';
import { CustomerLoader } from '../customer';
import { CollectionLoader } from '../collection';
import { FacetLoader } from '../facet';
import { FacetValueLoader } from '../facet-value';
import { PromotionLoader } from '../promotion';
import { CustomerGroupLoader } from '../customer-group';
import { AssetLoader } from '../asset';
import { OrderLoader } from '../order';
import { StockLocationLoader } from '../stock-location';
import { InventoryLoader } from '../inventory';
import { ShippingMethodLoader } from '../shipping-method';
import { TaxRateLoader } from '../tax-rate';
import { PaymentMethodLoader } from '../payment-method';
import { ChannelLoader } from '../channel';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';

export type LoaderRegistrationCallback = (registry: LoaderRegistryService) => void | Promise<void>;

@Injectable()
export class LoaderRegistryService implements LoaderRegistry, OnModuleInit {
    private readonly logger: DataHubLogger;
    private loaders = new Map<VendureEntityTypeUnion, EntityLoader>();
    private customCallbacks: LoaderRegistrationCallback[] = [];

    constructor(
        private moduleRef: ModuleRef,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.LOADER_REGISTRY);
    }

    async onModuleInit() {
        try {
            this.register(await this.moduleRef.resolve(ProductLoader));
            this.register(await this.moduleRef.resolve(ProductVariantLoader));

            this.register(await this.moduleRef.resolve(CustomerLoader));
            this.register(await this.moduleRef.resolve(CustomerGroupLoader));

            this.register(await this.moduleRef.resolve(CollectionLoader));
            this.register(await this.moduleRef.resolve(FacetLoader));
            this.register(await this.moduleRef.resolve(FacetValueLoader));

            this.register(await this.moduleRef.resolve(PromotionLoader));
            this.register(await this.moduleRef.resolve(OrderLoader));
            this.register(await this.moduleRef.resolve(ShippingMethodLoader));

            this.register(await this.moduleRef.resolve(StockLocationLoader));
            this.register(await this.moduleRef.resolve(InventoryLoader));

            this.register(await this.moduleRef.resolve(AssetLoader));

            // Tax, Payment & Channel
            this.register(await this.moduleRef.resolve(TaxRateLoader));
            this.register(await this.moduleRef.resolve(PaymentMethodLoader));
            this.register(await this.moduleRef.resolve(ChannelLoader));

            for (const callback of this.customCallbacks) {
                try {
                    await callback(this);
                } catch (error) {
                    this.logger.error(
                        'Loader registration callback failed',
                        error instanceof Error ? error : undefined,
                    );
                }
            }

            this.logger.info(`Loader registry initialized`, {
                recordCount: this.loaders.size,
            });
        } catch (error) {
            this.logger.error(
                'Failed to register loaders',
                error instanceof Error ? error : undefined,
            );
        }
    }

    addRegistrationCallback(callback: LoaderRegistrationCallback): void {
        this.customCallbacks.push(callback);
    }

    register(loader: EntityLoader): void {
        if (this.loaders.has(loader.entityType)) {
            this.logger.warn(`Overwriting existing loader`, {
                entityType: loader.entityType,
            });
        }
        this.loaders.set(loader.entityType, loader);
        this.logger.debug(`Registered loader: ${loader.name}`, {
            entityType: loader.entityType,
        });
    }

    get(entityType: VendureEntityTypeUnion): EntityLoader | undefined {
        return this.loaders.get(entityType);
    }

    getAll(): EntityLoader[] {
        return Array.from(this.loaders.values());
    }

    has(entityType: VendureEntityTypeUnion): boolean {
        return this.loaders.has(entityType);
    }

    getRegisteredTypes(): VendureEntityTypeUnion[] {
        return Array.from(this.loaders.keys());
    }

    getLoaderMetadata(): Array<{
        entityType: VendureEntityTypeUnion;
        name: string;
        description?: string;
        supportedOperations: string[];
        lookupFields: string[];
        requiredFields: string[];
    }> {
        return this.getAll().map(loader => ({
            entityType: loader.entityType,
            name: loader.name,
            description: loader.description,
            supportedOperations: loader.supportedOperations,
            lookupFields: loader.lookupFields,
            requiredFields: loader.requiredFields,
        }));
    }

    getFieldSchema(entityType: VendureEntityTypeUnion): EntityFieldSchema | undefined {
        const loader = this.get(entityType);
        return loader?.getFieldSchema();
    }

    getAllFieldSchemas(): Map<VendureEntityTypeUnion, EntityFieldSchema> {
        const schemas = new Map<VendureEntityTypeUnion, EntityFieldSchema>();
        for (const loader of this.getAll()) {
            schemas.set(loader.entityType, loader.getFieldSchema());
        }
        return schemas;
    }

    supportsOperation(entityType: VendureEntityTypeUnion, operation: string): boolean {
        const loader = this.get(entityType);
        return loader?.supportedOperations.includes(operation as TargetOperation) ?? false;
    }

    getLoadersByCategory(): Record<string, Array<{
        entityType: VendureEntityTypeUnion;
        name: string;
        description?: string;
    }>> {
        const categories: Record<string, VendureEntityTypeUnion[]> = {
            'Products': [VendureEntityType.PRODUCT, VendureEntityType.PRODUCT_VARIANT],
            'Customers': [VendureEntityType.CUSTOMER, VendureEntityType.CUSTOMER_GROUP],
            'Catalog': [VendureEntityType.COLLECTION, VendureEntityType.FACET, VendureEntityType.FACET_VALUE],
            'Commerce': [VendureEntityType.PROMOTION, VendureEntityType.ORDER, VendureEntityType.SHIPPING_METHOD, VendureEntityType.PAYMENT_METHOD],
            'Inventory': [VendureEntityType.STOCK_LOCATION, VendureEntityType.INVENTORY],
            'Media': [VendureEntityType.ASSET],
            'Configuration': [VendureEntityType.TAX_RATE, VendureEntityType.CHANNEL],
        };

        const result: Record<string, Array<{
            entityType: VendureEntityTypeUnion;
            name: string;
            description?: string;
        }>> = {};

        for (const [category, types] of Object.entries(categories)) {
            result[category] = types
                .map(type => {
                    const loader = this.get(type);
                    if (!loader) return null;
                    return {
                        entityType: type,
                        name: loader.name,
                        description: loader.description,
                    };
                })
                .filter((item): item is NonNullable<typeof item> => item !== null);
        }

        // Add any uncategorized loaders to "Other"
        const categorizedTypes = Object.values(categories).flat();
        const uncategorized = this.getRegisteredTypes().filter(type => !categorizedTypes.includes(type));
        if (uncategorized.length > 0) {
            result['Other'] = uncategorized
                .map(type => {
                    const loader = this.get(type);
                    if (!loader) return null;
                    return {
                        entityType: type,
                        name: loader.name,
                        description: loader.description,
                    };
                })
                .filter((item): item is NonNullable<typeof item> => item !== null);
        }

        return result;
    }
}
