/**
 * Built-in enricher adapters
 */
export { httpLookupEnricher, HttpLookupEnricherConfig } from './http-lookup.enricher';
export { lookupEnricher, LookupEnricherConfig } from './lookup.enricher';
export { vendureLookupEnricher, VendureLookupEnricherConfig } from './vendure-lookup.enricher';

import { httpLookupEnricher } from './http-lookup.enricher';
import { lookupEnricher } from './lookup.enricher';
import { vendureLookupEnricher } from './vendure-lookup.enricher';
import { EnricherAdapter, AdapterDefinition } from '../sdk/types';
import { JsonObject } from '../types';

/**
 * All built-in enricher adapters
 */
export const BUILT_IN_ENRICHERS: EnricherAdapter<JsonObject>[] = [
    httpLookupEnricher as unknown as EnricherAdapter<JsonObject>,
    lookupEnricher as unknown as EnricherAdapter<JsonObject>,
    vendureLookupEnricher as unknown as EnricherAdapter<JsonObject>,
];

/**
 * Enricher adapter definitions for UI/validation.
 * Filters out hidden adapters (e.g., experimental/incomplete).
 */
export const ENRICHER_ADAPTER_DEFINITIONS: AdapterDefinition[] = BUILT_IN_ENRICHERS
    .filter(e => !(e as { hidden?: boolean }).hidden)
    .map(e => ({
        type: e.type,
        code: e.code,
        name: e.name,
        description: e.description,
        category: e.category,
        schema: e.schema,
    }));
