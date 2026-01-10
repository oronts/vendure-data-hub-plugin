/**
 * Common Adapters Library
 *
 * Provides pre-built adapters for common data operations:
 * - File extractors (CSV, JSON, XML, XLSX)
 * - Vendure entity loaders (Product, Variant, Customer, Order)
 * - Common transformers
 * - Export adapters
 *
 * This file re-exports all adapters from their respective modules
 * for convenience.
 */

export * from './types';

export { getFieldValue, setFieldValue, evaluateCondition, isCompatibleType, slugify, escapeCSV } from './utils';
export type { FilterCondition } from './utils';

export { csvExtractor, jsonExtractor, xmlExtractor, extractors } from './extractors';

export { productLoader, variantLoader, customerLoader, loaders } from './loaders';

export { fieldMapperTransformer, filterTransformer, deduplicatorTransformer, enricherTransformer, transformers } from './transformers';

export { schemaValidator, validators } from './data-validators';

export { csvExporter, jsonExporter, exporters } from './exporters';

import { AdapterDefinition } from './types';
import { csvExtractor, jsonExtractor, xmlExtractor } from './extractors';
import { productLoader, variantLoader, customerLoader } from './loaders';
import { fieldMapperTransformer, filterTransformer, deduplicatorTransformer, enricherTransformer } from './transformers';
import { schemaValidator } from './data-validators';
import { csvExporter, jsonExporter } from './exporters';

// ADAPTER LIBRARY

/**
 * Collection of all common adapters
 */
export const COMMON_ADAPTERS: AdapterDefinition[] = [
    // Extractors
    csvExtractor,
    jsonExtractor,
    xmlExtractor,
    // Loaders
    productLoader,
    variantLoader,
    customerLoader,
    // Transformers
    fieldMapperTransformer,
    filterTransformer,
    deduplicatorTransformer,
    enricherTransformer,
    // Validators
    schemaValidator,
    // Exporters
    csvExporter,
    jsonExporter,
];
