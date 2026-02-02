import { SortOrder } from '../../constants/index';
import { ExtractorConfig } from '../../types/index';
import { JsonObject } from '../../types/index';
import { VendureEntityType } from '../../types/index';

export interface VendureQueryExtractorConfig extends ExtractorConfig {
    /** Entity type to query */
    entity: VendureEntityType;

    /** Filter conditions */
    filters?: VendureQueryFilter[];

    /** Fields to include */
    includeFields?: string[];

    /** Fields to exclude */
    excludeFields?: string[];

    /** Relations to load */
    relations?: string[];

    /** Channel codes to query */
    channelCodes?: string[];

    /** Language code for translations (e.g., 'en', 'de') */
    languageCode?: string;

    /**
     * Flatten translations into root object
     * When true and languageCode is set, translations will be merged into the root:
     * - translations[0].name → name
     * - translations[0].description → description
     * Default: true when languageCode is set
     */
    flattenTranslations?: boolean;

    /** Batch size for fetching */
    batchSize?: number;

    /** Sort field */
    sortBy?: string;

    /** Sort order */
    sortOrder?: SortOrder;

    /** Custom where clause */
    where?: JsonObject;
}

export interface VendureQueryFilter {
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like' | 'contains';
    value: unknown;
}
