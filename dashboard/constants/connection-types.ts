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
    POSTGRES: 'postgres',
    /** MySQL database connection */
    MYSQL: 'mysql',
    /** Microsoft SQL Server connection */
    MSSQL: 'mssql',
    /** MongoDB connection */
    MONGO: 'mongodb',
    /** AWS S3 or S3-compatible storage */
    S3: 's3',
    /** FTP server connection */
    FTP: 'ftp',
    /** SFTP (SSH File Transfer Protocol) connection */
    SFTP: 'sftp',
    /** Generic HTTP connection */
    HTTP: 'http',
    /** REST API connection */
    REST: 'rest',
    /** GraphQL API connection */
    GRAPHQL: 'graphql',
    /** Generic database connection (used when specific type unknown) */
    DATABASE: 'database',
    /** Custom connection type */
    CUSTOM: 'custom',
} as const;

export type ConnectionType = typeof CONNECTION_TYPE[keyof typeof CONNECTION_TYPE];

/** Database connection types */
const DATABASE_TYPES: readonly string[] = [
    CONNECTION_TYPE.POSTGRES,
    CONNECTION_TYPE.MYSQL,
    CONNECTION_TYPE.MSSQL,
    CONNECTION_TYPE.MONGO,
    CONNECTION_TYPE.DATABASE,
];

/** File transfer connection types */
const FILE_TRANSFER_TYPES: readonly string[] = [
    CONNECTION_TYPE.FTP,
    CONNECTION_TYPE.SFTP,
    CONNECTION_TYPE.S3,
];

/**
 * Check if a connection type is a database type.
 */
export function isDatabaseConnectionType(type: string): boolean {
    return DATABASE_TYPES.includes(type);
}

/**
 * Check if a connection type is a file transfer type.
 */
export function isFileTransferConnectionType(type: string): boolean {
    return FILE_TRANSFER_TYPES.includes(type);
}

// Note: DESTINATION_TYPE is defined in wizard-options.ts to avoid duplicate exports
