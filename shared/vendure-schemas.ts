/**
 * Re-export vendure entity schemas for dashboard access.
 *
 * NOTE: This is an intentional layer violation — shared/ imports from src/.
 * The schema definitions are large runtime objects with helper functions that
 * belong in src/, but the dashboard needs access to them. This bridge module
 * is the approved way for dashboard code to reach them without deep-importing
 * from src/ directly.
 *
 * Dashboard code should import VENDURE_ENTITY_SCHEMAS and VENDURE_ENTITY_LIST
 * from this shared module (or via shared/index.ts) rather than reaching into
 * src/ or the top-level vendure-schemas/ bridge directory.
 */
export {
    VENDURE_ENTITY_SCHEMAS,
    VENDURE_ENTITY_LIST,
    PRODUCT_SCHEMA,
    PRODUCT_VARIANT_SCHEMA,
    ORDER_SCHEMA,
    CUSTOMER_SCHEMA,
    COLLECTION_SCHEMA,
    FACET_SCHEMA,
    ASSET_SCHEMA,
    STOCK_LEVEL_SCHEMA,
    PROMOTION_SCHEMA,
} from '../src/vendure-schemas/vendure-entity-schemas';
