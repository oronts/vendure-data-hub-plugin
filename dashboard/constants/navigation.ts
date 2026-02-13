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

/** Base route for pipeline pages */
export const DATAHUB_ROUTE_BASE = '/data-hub/pipelines';

/** Base path for DataHub REST API endpoints */
export const DATAHUB_API_BASE = '/data-hub';

/** File upload API endpoint */
export const DATAHUB_API_UPLOAD = `${DATAHUB_API_BASE}/upload`;

/**
 * Generate file preview API URL.
 * @param fileId - The uploaded file ID
 * @param rows - Number of rows to preview
 */
const DATAHUB_API_FILE_PREVIEW = (fileId: string, rows: number) =>
    `${DATAHUB_API_BASE}/files/${fileId}/preview?rows=${rows}`;

/**
 * Generate webhook URL for a pipeline.
 * @param code - The pipeline code
 */
export const DATAHUB_API_WEBHOOK = (code: string) =>
    `${DATAHUB_API_BASE}/webhook/${code}`;
