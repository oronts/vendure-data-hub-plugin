/**
 * Vendure Query Extractor schema definition
 *
 * Extracted so both the runtime extractor class and extractor-handler-registry.ts
 * can reference the same schema without circular dependencies.
 *
 * IMPORTANT: Do NOT import from '../../constants/index' (barrel) here.
 * This file is imported by extractor-handler-registry.ts which is re-exported
 * from that barrel, so importing it would create a circular dependency.
 */
import { StepConfigSchema } from '../../../shared/types/extractor.types';
import { SortOrder } from '../../constants/enums';
import { BATCH } from '../../../shared/constants';
import { SORT_ORDER_OPTIONS, VENDURE_ENTITY_TYPE_OPTIONS } from '../../constants/adapter-schema-options';

export const VENDURE_QUERY_EXTRACTOR_SCHEMA: StepConfigSchema = {
    fields: [
        {
            key: 'entity',
            label: 'Entity Type',
            description: 'Vendure entity to extract',
            type: 'select',
            required: true,
            options: VENDURE_ENTITY_TYPE_OPTIONS,
        },
        {
            key: 'relations',
            label: 'Relations',
            description: 'Relations to include (comma-separated)',
            type: 'string',
            placeholder: 'variants,featuredAsset,translations',
        },
        {
            key: 'batchSize',
            label: 'Batch Size',
            description: 'Number of records per batch',
            type: 'number',
            defaultValue: BATCH.BULK_SIZE,
        },
        {
            key: 'sortBy',
            label: 'Sort By',
            description: 'Field to sort by',
            type: 'string',
            defaultValue: 'createdAt',
        },
        {
            key: 'sortOrder',
            label: 'Sort Order',
            type: 'select',
            options: SORT_ORDER_OPTIONS,
            defaultValue: SortOrder.ASC,
        },
    ],
};
