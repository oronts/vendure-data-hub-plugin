import { getMockApiUrl } from './ports';

export const PIMCORE_API_CONNECTION_CODE = 'pimcore-api';
export const PIMCORE_API_URL = getMockApiUrl('PIMCORE');

export const PIMCORE_GRAPHQL_CONNECTION_CODE = 'pimcore-graphql';
export const PIMCORE_GRAPHQL_URL = process.env.PIMCORE_GRAPHQL_URL?.trim();

export function assertPimcoreGraphqlApiKey(
    graphqlUrl: string | undefined,
    apiKey: string | undefined,
): void {
    if (graphqlUrl && !apiKey?.trim()) {
        throw new Error(
            'PIMCORE_API_KEY must be set explicitly when PIMCORE_GRAPHQL_URL is configured',
        );
    }
}
