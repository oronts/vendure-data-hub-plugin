/**
 * Lookup Enricher - Enrich records by looking up values from a static map
 */
import { EnricherAdapter, EnrichContext, EnrichResult, StepConfigSchema } from '../sdk/types';
import { JsonObject, JsonValue } from '../types';
import { getPath, setPath } from '../runtime/utils';

export interface LookupEnricherConfig {
    /** Source field path to get lookup key */
    source: string;
    /** Lookup map as JSON object */
    map: Record<string, JsonValue>;
    /** Target field path to set result */
    target: string;
    /** Default value if key not found */
    default?: JsonValue;
}

const LOOKUP_ENRICHER_SCHEMA: StepConfigSchema = {
    fields: [
        { key: 'source', label: 'Source Field', type: 'string', required: true, description: 'Field path to get lookup key from' },
        { key: 'map', label: 'Lookup Map', type: 'json', required: true, description: 'JSON object mapping keys to values' },
        { key: 'target', label: 'Target Field', type: 'string', required: true, description: 'Field path to store the result' },
        { key: 'default', label: 'Default Value', type: 'json', description: 'Value to use if key not found in map' },
    ],
};

export const lookupEnricher: EnricherAdapter<LookupEnricherConfig> = {
    type: 'ENRICHER',
    code: 'lookup',
    name: 'Lookup',
    description: 'Enrich records by looking up values from a static map.',
    category: 'ENRICHMENT',
    schema: LOOKUP_ENRICHER_SCHEMA,

    async enrich(
        _context: EnrichContext,
        config: LookupEnricherConfig,
        records: readonly JsonObject[],
    ): Promise<EnrichResult> {
        if (!config.source || !config.map || !config.target) {
            return { records: [...records] };
        }

        const results = records.map(record => {
            const copy = { ...record } as JsonObject;
            const key = getPath(copy, config.source);
            const keyStr = key == null ? '' : String(key);

            if (keyStr in config.map) {
                setPath(copy, config.target, config.map[keyStr]);
            } else if (config.default !== undefined) {
                setPath(copy, config.target, config.default);
            }

            return copy;
        });

        return { records: results };
    },
};
