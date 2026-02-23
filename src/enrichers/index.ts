/**
 * Built-in enricher adapters
 */
import { httpLookupEnricher } from './http-lookup.enricher';
import { lookupEnricher } from './lookup.enricher';
import { EnricherAdapter, AdapterDefinition } from '../sdk/types';
import { JsonObject } from '../types';

export const BUILT_IN_ENRICHERS: EnricherAdapter<JsonObject>[] = [
    httpLookupEnricher as unknown as EnricherAdapter<JsonObject>,
    lookupEnricher as unknown as EnricherAdapter<JsonObject>,
];

export const ENRICHER_ADAPTER_DEFINITIONS: AdapterDefinition[] = BUILT_IN_ENRICHERS.map(e => ({
    type: e.type,
    code: e.code,
    name: e.name,
    description: e.description,
    category: e.category,
    schema: e.schema,
}));
