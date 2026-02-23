/**
 * Entity Loader Registry
 *
 * Single source of truth for the mapping between VendureEntityType values and entity loader classes.
 * Both data-hub.plugin.ts (providers) and loader-registry.service.ts (init) reference
 * this registry, eliminating the need to manually maintain loader lists in multiple files.
 *
 * To add a new entity loader:
 * 1. Create the loader directory with types.ts and <entity>.loader.ts
 * 2. Add the VendureEntityType entry in src/constants/enums.ts (if not already present)
 * 3. Add the entry to ENTITY_LOADER_REGISTRY below
 * That's it - no changes needed in data-hub.plugin.ts or loader-registry.service.ts.
 */
import { Type } from '@vendure/core';
import { VendureEntityType } from '../constants/enums';
import { ProductLoader } from './product';
import { ProductVariantLoader } from './product-variant';
import { CustomerLoader } from './customer';
import { CustomerGroupLoader } from './customer-group';
import { CollectionLoader } from './collection';
import { FacetLoader } from './facet';
import { FacetValueLoader } from './facet-value';
import { PromotionLoader } from './promotion';
import { OrderLoader } from './order';
import { ShippingMethodLoader } from './shipping-method';
import { PaymentMethodLoader } from './payment-method';
import { TaxRateLoader } from './tax-rate';
import { ChannelLoader } from './channel';
import { StockLocationLoader } from './stock-location';
import { InventoryLoader } from './inventory';
import { AssetLoader } from './asset';

// Use Type<unknown> because entity loaders have different generic parameters
// (e.g., ProductLoader implements EntityLoader<ProductInput>), and NestJS
// providers accept any class reference.
type LoaderClass = Type<unknown>;

/**
 * Maps each VendureEntityType to its corresponding entity loader class.
 * Used by LoaderRegistryService for init and by DataHubPlugin for provider registration.
 */
export const ENTITY_LOADER_REGISTRY: ReadonlyMap<string, LoaderClass> = new Map<string, LoaderClass>([
    [VendureEntityType.PRODUCT, ProductLoader],
    [VendureEntityType.PRODUCT_VARIANT, ProductVariantLoader],
    [VendureEntityType.CUSTOMER, CustomerLoader],
    [VendureEntityType.CUSTOMER_GROUP, CustomerGroupLoader],
    [VendureEntityType.COLLECTION, CollectionLoader],
    [VendureEntityType.FACET, FacetLoader],
    [VendureEntityType.FACET_VALUE, FacetValueLoader],
    [VendureEntityType.PROMOTION, PromotionLoader],
    [VendureEntityType.ORDER, OrderLoader],
    [VendureEntityType.SHIPPING_METHOD, ShippingMethodLoader],
    [VendureEntityType.PAYMENT_METHOD, PaymentMethodLoader],
    [VendureEntityType.TAX_RATE, TaxRateLoader],
    [VendureEntityType.CHANNEL, ChannelLoader],
    [VendureEntityType.STOCK_LOCATION, StockLocationLoader],
    [VendureEntityType.INVENTORY, InventoryLoader],
    [VendureEntityType.ASSET, AssetLoader],
]);

/** All entity loader classes, for use as NestJS providers */
export const ENTITY_LOADER_PROVIDERS: LoaderClass[] = [...new Set(ENTITY_LOADER_REGISTRY.values())];
