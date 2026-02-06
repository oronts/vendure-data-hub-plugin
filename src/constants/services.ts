export const SEARCH_SERVICE_PORTS = {
    MEILISEARCH: 7700,
    ELASTICSEARCH: 9200,
    TYPESENSE: 8108,
} as const;

/**
 * Environment variable names for search service URLs
 * Users can configure these in their environment to override defaults
 */
export const SEARCH_SERVICE_ENV_VARS = {
    MEILISEARCH: 'DATAHUB_MEILISEARCH_URL',
    ELASTICSEARCH: 'DATAHUB_ELASTICSEARCH_URL',
    TYPESENSE: 'DATAHUB_TYPESENSE_URL',
} as const;

/**
 * Get search service URL from environment or use default
 * @param service - The search service name
 * @returns Configured URL or default localhost URL
 */
export function getSearchServiceUrl(service: keyof typeof SEARCH_SERVICE_PORTS): string {
    const envVar = SEARCH_SERVICE_ENV_VARS[service];
    const envValue = process.env[envVar];
    if (envValue) {
        return envValue;
    }
    const port = SEARCH_SERVICE_PORTS[service];
    return `http://localhost:${port}`;
}

/**
 * Default URLs for search services.
 * Evaluated at module load time using environment variables or defaults.
 */
export const SEARCH_SERVICE_URLS = {
    MEILISEARCH: getSearchServiceUrl('MEILISEARCH'),
    ELASTICSEARCH: getSearchServiceUrl('ELASTICSEARCH'),
    TYPESENSE: getSearchServiceUrl('TYPESENSE'),
} as const;

/**
 * Example URLs for documentation and placeholders
 */
export const EXAMPLE_URLS = {
    BASE: 'https://example.com',
    API: 'https://api.example.com',
    S3: 'https://s3.example.com',
    PRODUCTS_API: 'https://api.example.com/products',
    IMAGES: 'https://example.com/images',
} as const;

/**
 * Combined service defaults for convenient access
 */
export const SERVICE_DEFAULTS = {
    MEILISEARCH_URL: SEARCH_SERVICE_URLS.MEILISEARCH,
    ELASTICSEARCH_URL: SEARCH_SERVICE_URLS.ELASTICSEARCH,
    TYPESENSE_URL: SEARCH_SERVICE_URLS.TYPESENSE,
    EXAMPLE_BASE_URL: EXAMPLE_URLS.BASE,
} as const;

/**
 * XML namespaces for feeds
 */
export const FEED_NAMESPACES = {
    /** Google Shopping/Merchant namespace */
    GOOGLE_PRODUCT: 'http://base.google.com/ns/1.0',
    /** Facebook Product Catalog namespace */
    FACEBOOK_CATALOG: 'http://www.facebook.com/products/feed/2.0',
    /** RSS 2.0 content module */
    RSS_CONTENT: 'http://purl.org/rss/1.0/modules/content/',
    /** Dublin Core elements */
    DC: 'http://purl.org/dc/elements/1.1/',
    /** Atom namespace */
    ATOM: 'http://www.w3.org/2005/Atom',
} as const;

/**
 * Content-Type headers
 */
export const CONTENT_TYPES = {
    JSON: 'application/json',
    NDJSON: 'application/x-ndjson',
    XML: 'application/xml',
    RSS: 'application/rss+xml',
    ATOM: 'application/atom+xml',
    CSV: 'text/csv',
    HTML: 'text/html',
    PLAIN: 'text/plain',
    FORM_URLENCODED: 'application/x-www-form-urlencoded',
    MULTIPART: 'multipart/form-data',
    OCTET_STREAM: 'application/octet-stream',
} as const;

/**
 * Common HTTP headers
 */
export const HTTP_HEADERS = {
    CONTENT_TYPE: 'Content-Type',
    AUTHORIZATION: 'Authorization',
    ACCEPT: 'Accept',
    USER_AGENT: 'User-Agent',
    X_API_KEY: 'X-API-Key',
    X_REQUEST_ID: 'X-Request-ID',
    X_DATAHUB_SIGNATURE: 'X-DataHub-Signature',
    X_TYPESENSE_API_KEY: 'X-TYPESENSE-API-KEY',
} as const;

/**
 * Authentication scheme prefixes for Authorization header
 */
export const AUTH_SCHEMES = {
    BEARER: 'Bearer',
    BASIC: 'Basic',
    API_KEY: 'ApiKey',
} as const;

/**
 * URL templates for external services
 */
export const SERVICE_URL_TEMPLATES = {
    /** Algolia API URL template - use with applicationId */
    ALGOLIA_API: (applicationId: string) => `https://${applicationId}.algolia.net`,
    /** S3 bucket URL template */
    S3_BUCKET: (bucket: string, region: string) => `https://${bucket}.s3.${region}.amazonaws.com`,
} as const;

/**
 * XML namespace URIs for standard formats
 */
export const XML_NAMESPACES = {
    /** XHTML namespace */
    XHTML: 'http://www.w3.org/1999/xhtml',
    /** Atom 1.0 namespace */
    ATOM_1_0: 'http://www.w3.org/2005/Atom',
    /** RSS 2.0 Google base namespace */
    GOOGLE_BASE: 'http://base.google.com/ns/1.0',
} as const;

/**
 * Supported feed format definitions for product feeds
 */
export interface FeedFormatInfo {
    code: string;
    label: string;
    description: string;
    contentType: string;
    extension: string;
}

/**
 * Available feed format types with content type and extension metadata
 */
export const FEED_FORMATS: readonly FeedFormatInfo[] = [
    { code: 'google_shopping', label: 'Google Shopping', description: 'Google Merchant Center XML feed', contentType: CONTENT_TYPES.XML, extension: 'xml' },
    { code: 'facebook_catalog', label: 'Facebook Catalog', description: 'Facebook/Instagram product catalog (CSV)', contentType: CONTENT_TYPES.CSV, extension: 'csv' },
    { code: 'csv', label: 'CSV', description: 'Generic CSV export', contentType: CONTENT_TYPES.CSV, extension: 'csv' },
    { code: 'json', label: 'JSON', description: 'Generic JSON export', contentType: CONTENT_TYPES.JSON, extension: 'json' },
    { code: 'xml', label: 'XML', description: 'Generic XML export', contentType: CONTENT_TYPES.XML, extension: 'xml' },
] as const;

/**
 * Lookup map for feed format metadata by code
 */
export const FEED_FORMAT_MAP = new Map(FEED_FORMATS.map(f => [f.code, f]));
