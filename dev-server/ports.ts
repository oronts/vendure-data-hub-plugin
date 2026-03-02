/**
 * Central port registry for all dev-server mock APIs.
 * Referenced by both mock server startup files and example pipeline definitions.
 */
export const MOCK_PORTS = {
    /** Pimcore mock API */
    PIMCORE: parseInt(process.env.PIMCORE_PORT || '3333', 10),
    /** Edge case API (resilience testing) */
    EDGE_CASE: parseInt(process.env.EDGE_CASE_PORT || '4100', 10),
    /** Shopify mock API */
    SHOPIFY: parseInt(process.env.SHOPIFY_PORT || '3336', 10),
    /** Magento mock API */
    MAGENTO: parseInt(process.env.MAGENTO_PORT || '3337', 10),
} as const;

/** Build a localhost URL from a port number */
export function mockUrl(port: number): string {
    return `http://localhost:${port}`;
}
