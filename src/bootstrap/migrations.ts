/**
 * DataHub Migrations
 *
 * Database migration utilities for the DataHub plugin.
 */

/**
 * Migration configuration for DataHub entities.
 * Can be extended to support custom migration logic.
 */
export interface DataHubMigrationConfig {
    /**
     * Whether to run migrations automatically on startup
     */
    autoMigrate?: boolean;

    /**
     * Migration version to target (for rollback scenarios)
     */
    targetVersion?: string;
}

/**
 * Default migration configuration
 */
export const DEFAULT_MIGRATION_CONFIG: DataHubMigrationConfig = {
    autoMigrate: true,
};

/**
 * Migration service for custom migration logic.
 * TypeORM handles migrations automatically for Vendure plugins.
 */
export class DataHubMigrationService {
    // Extend for custom migration logic
}
