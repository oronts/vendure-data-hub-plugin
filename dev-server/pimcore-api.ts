import { MOCK_PORTS, mockUrl } from './ports';

export const PIMCORE_API_CONNECTION_CODE = 'pimcore-api';
export const PIMCORE_API_URL = (
    process.env.PIMCORE_API_URL || mockUrl(MOCK_PORTS.PIMCORE)
).replace(/\/+$/, '');

export const PIMCORE_GRAPHQL_CONNECTION_CODE = 'pimcore-graphql';
export const PIMCORE_GRAPHQL_URL = process.env.PIMCORE_GRAPHQL_URL?.trim();
