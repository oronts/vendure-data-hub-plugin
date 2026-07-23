import { DATAHUB_ROUTE_BASE, DATAHUB_API_BASE } from './navigation';

export const ROUTES = {
    PIPELINES: DATAHUB_ROUTE_BASE,
    HOOKS: `${DATAHUB_API_BASE}/hooks`,
    SETTINGS: `${DATAHUB_API_BASE}/settings`,
    ADAPTERS: `${DATAHUB_API_BASE}/adapters`,
    LOGS: `${DATAHUB_API_BASE}/logs`,
    QUEUES: `${DATAHUB_API_BASE}/queues`,
    SECRETS: `${DATAHUB_API_BASE}/secrets`,
    CONNECTIONS: `${DATAHUB_API_BASE}/connections`,
    SCHEMAS: `${DATAHUB_API_BASE}/schemas`,
} as const;

export const DETAIL_ROUTES = {
    PIPELINE: `${ROUTES.PIPELINES}/$id`,
    SCHEMA: `${ROUTES.SCHEMAS}/$id`,
} as const;
