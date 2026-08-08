/**
 * Navigation constants for DataHub admin UI.
 *
 * Note: These values must match the backend constants in src/constants/core.ts
 * to ensure proper navigation and routing. The dashboard maintains its own copy
 * to avoid layer violations between dashboard and backend code.
 */

/** Navigation section identifier for DataHub */
export const DATAHUB_NAV_SECTION = 'data-hub';

/** Navigation item ID for pipelines */
export const DATAHUB_NAV_ID = 'data-hub-pipelines';

export const DATAHUB_NAV_LABELS = {
    DATA_HUB: /* i18n */ 'Data Hub',
    PIPELINES: /* i18n */ 'Pipelines',
    ADAPTERS: /* i18n */ 'Adapters',
    SECRETS: /* i18n */ 'Secrets',
    CONNECTIONS: /* i18n */ 'Connections',
    HOOKS: /* i18n */ 'Hooks & Events',
    QUEUES: /* i18n */ 'Queues',
    SETTINGS: /* i18n */ 'Settings',
    LOGS: /* i18n */ 'Logs & Analytics',
    FEEDS: /* i18n */ 'Feeds',
    FEED: /* i18n */ 'Feed',
    DESTINATIONS: /* i18n */ 'Destinations',
    SCHEMAS: /* i18n */ 'Schemas',
} as const;

export const DATAHUB_FIELD_TRANSLATION_IDS = {
    NAME: /* i18n */ 'fieldName.name',
    CODE: /* i18n */ 'fieldName.code',
    TYPE: /* i18n */ 'fieldName.type',
    STATUS: /* i18n */ 'fieldName.status',
    VERSION: /* i18n */ 'fieldName.version',
    ENABLED: /* i18n */ 'fieldName.enabled',
    PROVIDER: /* i18n */ 'fieldName.provider',
    VALUE_STATUS: /* i18n */ 'fieldName.valueStatus',
    IS_OVERRIDDEN: /* i18n */ 'fieldName.isOverridden',
} as const;

export const DATAHUB_PAGE_LABELS = {
    IMPORT_WIZARD: /* i18n */ 'Import Wizard',
    EXPORT_WIZARD: /* i18n */ 'Export Wizard',
    NEW_CONNECTION: /* i18n */ 'New connection',
    NEW_PIPELINE: /* i18n */ 'New pipeline',
    NEW_SECRET: /* i18n */ 'New secret',
    NEW_SCHEMA: /* i18n */ 'New schema version',
    NEW_DESTINATION: /* i18n */ 'New destination',
} as const;

/** Base route for pipeline pages */
export const DATAHUB_ROUTE_BASE = '/data-hub/pipelines';

/** Base path for DataHub REST API endpoints */
export const DATAHUB_API_BASE = '/data-hub';

/** File upload API endpoint */
export const DATAHUB_API_UPLOAD = `${DATAHUB_API_BASE}/upload`;

export const VENDURE_DASHBOARD_STORAGE_KEYS = {
    SESSION_TOKEN: 'vendure-session-token',
    CHANNEL_TOKEN: 'vendure-selected-channel-token',
} as const;

/**
 * Generate webhook URL for a pipeline.
 * @param code - The pipeline code
 */
export const DATAHUB_API_WEBHOOK = (code: string) =>
    `${DATAHUB_API_BASE}/webhook/${code}`;
