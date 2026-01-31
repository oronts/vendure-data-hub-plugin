/**
 * Storage Backend Interface
 * Abstraction layer for pluggable storage backends (local filesystem, S3, etc.)
 */

export interface StorageBackend {
    /** Unique identifier for this backend type */
    readonly type: 'local' | 's3';

    /** Initialize the backend */
    init(): Promise<void>;

    /** Write data to storage */
    write(path: string, data: Buffer): Promise<void>;

    /** Read data from storage */
    read(path: string): Promise<Buffer | null>;

    /** Delete data from storage */
    delete(path: string): Promise<boolean>;

    /** Check if path exists */
    exists(path: string): Promise<boolean>;

    /** List files in a directory */
    list(prefix: string): Promise<string[]>;

    /** Get a public/signed URL for the file (if supported) */
    getUrl?(path: string, expiresInSeconds?: number): Promise<string | null>;
}

export interface StorageBackendOptions {
    type: 'local' | 's3';
    local?: LocalStorageOptions;
    s3?: S3StorageOptions;
}

export interface LocalStorageOptions {
    basePath: string;
}

export interface S3StorageOptions {
    bucket: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    prefix?: string;
    signedUrlExpiry?: number;
}
