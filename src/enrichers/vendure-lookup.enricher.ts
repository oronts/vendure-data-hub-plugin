/**
 * Vendure Lookup Enricher - Enrich records by looking up Vendure entities
 */
import { EnricherAdapter, EnrichContext, EnrichResult, StepConfigSchema } from '../sdk/types';
import { JsonObject, JsonValue } from '../types';
import { getPath, setPath } from '../runtime/utils';
import { VendureEntityType } from '../constants/enums';

export interface VendureLookupEnricherConfig {
    /** Vendure entity type to lookup */
    entity: VendureEntityType;
    /** Source field path containing the lookup value (e.g., SKU, email) */
    source: string;
    /** Entity field to match against (e.g., 'sku', 'emailAddress', 'code') */
    matchField: string;
    /** Target field path to store the found entity or specific field */
    target: string;
    /** Specific field to extract from entity (optional - if not set, stores entire entity) */
    extractField?: string;
    /** Default value if entity not found */
    default?: JsonValue;
    /** Relations to load (comma-separated) */
    relations?: string;
}

const VENDURE_LOOKUP_ENRICHER_SCHEMA: StepConfigSchema = {
    fields: [
        { key: 'entity', label: 'Entity Type', type: 'select', required: true, options: [
            { value: VendureEntityType.PRODUCT, label: 'Product' },
            { value: VendureEntityType.PRODUCT_VARIANT, label: 'Product Variant' },
            { value: VendureEntityType.CUSTOMER, label: 'Customer' },
            { value: VendureEntityType.ORDER, label: 'Order' },
            { value: VendureEntityType.COLLECTION, label: 'Collection' },
            { value: VendureEntityType.FACET, label: 'Facet' },
            { value: VendureEntityType.FACET_VALUE, label: 'Facet Value' },
        ] },
        { key: 'source', label: 'Source Field', type: 'string', required: true, description: 'Field containing the lookup value' },
        { key: 'matchField', label: 'Match Field', type: 'string', required: true, description: 'Entity field to match (e.g., sku, emailAddress, code)' },
        { key: 'target', label: 'Target Field', type: 'string', required: true, description: 'Field to store the result' },
        { key: 'extractField', label: 'Extract Field', type: 'string', description: 'Specific field to extract (optional)' },
        { key: 'default', label: 'Default Value', type: 'json' },
        { key: 'relations', label: 'Relations', type: 'string', description: 'Comma-separated relations to load' },
    ],
};

export const vendureLookupEnricher: EnricherAdapter<VendureLookupEnricherConfig> = {
    type: 'enricher',
    code: 'vendureLookup',
    name: 'Vendure Lookup',
    description: 'Enrich records by looking up Vendure entities (Products, Customers, etc.)',
    category: 'catalog',
    schema: VENDURE_LOOKUP_ENRICHER_SCHEMA,

    async enrich(
        context: EnrichContext,
        config: VendureLookupEnricherConfig,
        records: readonly JsonObject[],
    ): Promise<EnrichResult> {
        if (!config.entity || !config.source || !config.matchField || !config.target) {
            return { records: [...records] };
        }

        // Build a cache of lookups to avoid repeated queries
        const lookupValues = new Set<string>();
        for (const record of records) {
            const value = getPath(record, config.source);
            if (value != null) {
                lookupValues.add(String(value));
            }
        }

        // Log that this enricher needs Vendure services to be injected at runtime
        context.logger.info(`Vendure lookup enricher: would lookup ${lookupValues.size} unique values from ${config.entity}`);

        // For now, return records unchanged with a note that full implementation
        // requires runtime service injection
        const results = records.map(record => {
            const copy = { ...record } as JsonObject;

            // If default is provided, set it
            if (config.default !== undefined) {
                setPath(copy, config.target, config.default);
            }

            return copy;
        });

        return { records: results };
    },
};
