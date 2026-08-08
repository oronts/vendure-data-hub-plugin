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

export type MockService = keyof typeof MOCK_PORTS;

const MOCK_API_URL_ENV = {
    PIMCORE: 'PIMCORE_API_URL',
    EDGE_CASE: 'EDGE_API_URL',
    SHOPIFY: 'SHOPIFY_API_URL',
    MAGENTO: 'MAGENTO_API_URL',
} as const satisfies Record<MockService, string>;

export const MOCK_ROUTES = {
    HEALTH: '/health',
    PIMCORE_HEALTH: '/api/health',
    EDGE_WEBHOOK: '/api/webhook',
    EDGE_GRAPHQL: '/api/graphql',
} as const;

/** Build a localhost URL from a port number */
export function mockUrl(port: number): string {
    return `http://localhost:${port}`;
}

/** Resolve a mock API base URL while preserving explicit integration overrides. */
export function getMockApiUrl(service: MockService): string {
    const override = process.env[MOCK_API_URL_ENV[service]]?.trim();
    return override
        ? override.replace(/\/+$/, '')
        : mockUrl(MOCK_PORTS[service]);
}

export function getMockEndpoint(
    service: MockService,
    route: string,
): string {
    const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
    return `${getMockApiUrl(service)}${normalizedRoute}`;
}
