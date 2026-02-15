/**
 * Connection type constants for the dashboard.
 *
 * These values mirror the backend ConnectionType enum from src/constants/enums.ts
 * plus additional database-specific types for UI purposes. The dashboard maintains
 * its own copy to avoid layer violations and allow for UI-specific extensions.
 *
 * Backend ConnectionType: HTTP, S3, FTP, SFTP, DATABASE, CUSTOM
 * Dashboard extensions: POSTGRES, MYSQL, MSSQL, MONGO, REST, GRAPHQL (specific database/API types)
 */
export const CONNECTION_TYPE = {
    /** PostgreSQL database connection */
    POSTGRES: 'POSTGRES',
    /** MySQL database connection */
    MYSQL: 'MYSQL',
    /** Microsoft SQL Server connection */
    MSSQL: 'MSSQL',
    /** MongoDB connection */
    MONGO: 'MONGODB',
    /** AWS S3 or S3-compatible storage */
    S3: 'S3',
    /** FTP server connection */
    FTP: 'FTP',
    /** SFTP (SSH File Transfer Protocol) connection */
    SFTP: 'SFTP',
    /** Generic HTTP connection */
    HTTP: 'HTTP',
    /** REST API connection */
    REST: 'REST',
    /** GraphQL API connection */
    GRAPHQL: 'GRAPHQL',
    /** Generic database connection (used when specific type unknown) */
    DATABASE: 'DATABASE',
    /** Custom connection type */
    CUSTOM: 'CUSTOM',
} as const;

export type ConnectionType = typeof CONNECTION_TYPE[keyof typeof CONNECTION_TYPE];

// Note: DESTINATION_TYPE is defined in wizard-options.ts to avoid duplicate exports
