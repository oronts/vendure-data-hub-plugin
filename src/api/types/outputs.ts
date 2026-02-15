/**
 * DataHub GraphQL Output Types — Extractor Resolver
 *
 * These types define the GraphQL response shapes for extractor queries.
 * Used by extractor.resolver.ts to type resolver return values.
 *
 * Note: Other resolver output types live in their respective service modules:
 * - Analytics: src/services/analytics/analytics.types.ts
 * - Webhooks: src/services/webhooks/webhook.types.ts
 * - Validation: src/validation/rules/types.ts
 * - Feeds: local interfaces in feed.resolver.ts
 * - Queues: local interface in queue.resolver.ts
 */

// EXTRACTOR OUTPUTS

/**
 * Extractor GraphQL representation
 */
export interface ExtractorOutput {
    code: string;
    name: string;
    description?: string;
    category: string;
    version?: string;
    icon?: string;
    supportsPagination: boolean;
    supportsIncremental: boolean;
    supportsCancellation: boolean;
    isStreaming: boolean;
    isBatch: boolean;
    schema: ExtractorSchemaOutput;
}

/**
 * Extractor schema output
 */
export interface ExtractorSchemaOutput {
    fields: ExtractorFieldOutput[];
    groups?: ExtractorGroupOutput[];
}

/**
 * Extractor field output
 */
export interface ExtractorFieldOutput {
    key: string;
    label: string;
    description?: string;
    type: string;
    required?: boolean;
    defaultValue?: unknown;
    placeholder?: string;
    options?: Array<{ value: string; label: string }>;
    group?: string;
    dependsOn?: {
        field: string;
        value: unknown;
        operator?: string;
    };
}

/**
 * Extractor group output
 */
export interface ExtractorGroupOutput {
    id: string;
    label: string;
    description?: string;
}

/**
 * Extractors by category
 */
export interface ExtractorsByCategoryOutput {
    category: string;
    label: string;
    extractors: ExtractorOutput[];
}
