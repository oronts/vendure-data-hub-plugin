import { ExtractorConfig } from '../../types/index';

/** CDC tracking column type */
export type CdcTrackingType = 'TIMESTAMP' | 'VERSION';

/** CDC operation types added to output records */
export type CdcOperation = 'INSERT' | 'UPDATE' | 'UPSERT' | 'DELETE';

export interface CdcExtractorConfig extends ExtractorConfig {
    adapterCode: 'cdc';
    /** Database type (only PostgreSQL and MySQL are supported) */
    databaseType: 'POSTGRESQL' | 'MYSQL';
    /** Connection code for database lookup via ConnectionService */
    connectionCode: string;
    /** Table to poll for changes */
    table: string;
    /** Column used to detect changes (e.g., updated_at, version) */
    trackingColumn: string;
    /** How the tracking column is interpreted */
    trackingType: CdcTrackingType;
    /** Primary key column name */
    primaryKey: string;
    /** Specific columns to select (omit for all columns) */
    columns?: string[];
    /** Maximum rows per extraction batch */
    batchSize?: number;
    /** Whether to track soft-deletes */
    includeDeletes?: boolean;
    /** Column that indicates deletion timestamp (required when includeDeletes is true) */
    deleteColumn?: string;
}

export const CDC_DEFAULTS = {
    batchSize: 1000,
} as const;
