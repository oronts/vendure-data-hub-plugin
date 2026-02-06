/**
 * Vendure Lookup Enricher - Enrich records by looking up Vendure entities
 *
 * @experimental This adapter is currently a no-op placeholder. Full implementation
 * requires Vendure services (TransactionalConnection, entity repositories) to be
 * injected at runtime through the plugin's dependency injection container.
 *
 * ## Current Limitations
 * - Does NOT actually perform entity lookups
 * - Only applies default values if configured
 * - All other records pass through unchanged
 *
 * ## What's Needed for Full Implementation
 * 1. Access to Vendure's TransactionalConnection for database queries
 * 2. Entity-specific repositories or services for each VendureEntityType
 * 3. Runtime service injection mechanism in the enricher execution context
 * 4. Proper handling of relations and custom field lookups
 *
 * @see VendureLookupEnricherConfig for configuration options
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

/**
 * Vendure Lookup Enricher Adapter
 *
 * @experimental This enricher is not yet fully implemented. It currently acts as a
 * pass-through that only applies default values. Full entity lookup functionality
 * requires Vendure service injection which is not yet available in the enricher context.
 *
 * TODO: Implement full Vendure entity lookup functionality
 * - [ ] Add VendureServices interface to EnrichContext (or create VendureEnrichContext)
 * - [ ] Inject TransactionalConnection via plugin initialization
 * - [ ] Implement entity-specific lookup methods for each VendureEntityType
 * - [ ] Add caching layer to avoid repeated queries for same lookup values
 * - [ ] Support relation loading via TypeORM relations option
 * - [ ] Handle soft-deleted entities appropriately
 * - [ ] Add proper error handling for missing entities vs lookup failures
 */
export const vendureLookupEnricher: EnricherAdapter<VendureLookupEnricherConfig> = {
    type: 'enricher',
    code: 'vendureLookup',
    name: 'Vendure Lookup',
    description: '[EXPERIMENTAL] Enrich records by looking up Vendure entities. Currently a no-op - returns records unchanged with optional defaults.',
    category: 'catalog',
    schema: VENDURE_LOOKUP_ENRICHER_SCHEMA,
    experimental: true,
    experimentalMessage: 'This enricher requires Vendure service injection which is not yet implemented. Currently only applies default values.',

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

        // TODO: Replace this placeholder with actual Vendure entity lookups once
        // service injection is available in the EnrichContext
        //
        // Implementation would:
        // 1. Use TransactionalConnection to query the appropriate entity repository
        // 2. Build a lookup map: lookupValue -> entity (or extracted field)
        // 3. Apply the lookup results to each record's target field
        //
        // Example pseudo-code for ProductVariant lookup:
        // const repo = connection.getRepository(ctx, ProductVariant);
        // const entities = await repo.find({ where: { [config.matchField]: In([...lookupValues]) } });
        // const lookupMap = new Map(entities.map(e => [e[config.matchField], e]));

        // Log warning about experimental status
        context.logger.warn(
            `[EXPERIMENTAL] Vendure lookup enricher is not fully implemented. ` +
            `Would lookup ${lookupValues.size} unique values from ${config.entity}, ` +
            `but currently only applies default values. ` +
            `Full implementation requires Vendure service injection.`
        );

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
