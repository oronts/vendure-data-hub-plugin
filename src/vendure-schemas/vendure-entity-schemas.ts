import type { EnhancedSchemaDefinition } from '../types/index';
import { kebabToScreamingSnake } from '../../shared/utils/string-case';
import { PRODUCT_SCHEMA, PRODUCT_VARIANT_SCHEMA } from './catalog-entity-schemas';
import { CUSTOMER_SCHEMA, ORDER_SCHEMA } from './customer-order-entity-schemas';
import {
    ASSET_SCHEMA,
    COLLECTION_SCHEMA,
    CUSTOMER_GROUP_SCHEMA,
    FACET_SCHEMA,
    FACET_VALUE_SCHEMA,
    PROMOTION_SCHEMA,
    STOCK_LEVEL_SCHEMA,
} from './organization-entity-schemas';
import {
    CHANNEL_SCHEMA,
    PAYMENT_METHOD_SCHEMA,
    SHIPPING_METHOD_SCHEMA,
    STOCK_LOCATION_SCHEMA,
    TAX_RATE_SCHEMA,
} from './settings-entity-schemas';

export * from './catalog-entity-schemas';
export * from './customer-order-entity-schemas';
export * from './organization-entity-schemas';
export * from './settings-entity-schemas';

// EXPORT ALL SCHEMAS

export const VENDURE_ENTITY_SCHEMAS: Record<string, EnhancedSchemaDefinition> = {
    'product': PRODUCT_SCHEMA,
    'product-variant': PRODUCT_VARIANT_SCHEMA,
    'order': ORDER_SCHEMA,
    'customer': CUSTOMER_SCHEMA,
    'customer-group': CUSTOMER_GROUP_SCHEMA,
    'collection': COLLECTION_SCHEMA,
    'facet': FACET_SCHEMA,
    'facet-value': FACET_VALUE_SCHEMA,
    'asset': ASSET_SCHEMA,
    'inventory': STOCK_LEVEL_SCHEMA,
    'promotion': PROMOTION_SCHEMA,
    'shipping-method': SHIPPING_METHOD_SCHEMA,
    'payment-method': PAYMENT_METHOD_SCHEMA,
    'tax-rate': TAX_RATE_SCHEMA,
    'stock-location': STOCK_LOCATION_SCHEMA,
    'channel': CHANNEL_SCHEMA,
};

/** Auto-derived from VENDURE_ENTITY_SCHEMAS. Used by dashboard for entity selection UI. */
export const VENDURE_ENTITY_LIST = Object.entries(VENDURE_ENTITY_SCHEMAS).map(
    ([code, schema]) => ({
        code,
        name: schema.label ?? code,
        description: schema.description ?? '',
    }),
);

/** Auto-derived from VENDURE_ENTITY_SCHEMAS. Keyed by SCREAMING_SNAKE entity type for resolver use. */
export const ENTITY_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
    Object.entries(VENDURE_ENTITY_SCHEMAS).map(([key, schema]) => [
        kebabToScreamingSnake(key),
        schema.description ?? '',
    ]),
);
