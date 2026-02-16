import { PORTS, HTTP, DEFAULT_HOSTS, SEARCH_SERVICE_PORTS } from './defaults';
import { CONNECTION_TYPE } from './connection-types';

export const CONNECTION_PORTS = {
    POSTGRESQL: PORTS.POSTGRESQL,
    MYSQL: PORTS.MYSQL,
    FTP: PORTS.FTP,
    SFTP: PORTS.SFTP,
    ELASTICSEARCH: SEARCH_SERVICE_PORTS.ELASTICSEARCH,
    MEILISEARCH: SEARCH_SERVICE_PORTS.MEILISEARCH,
    TYPESENSE: SEARCH_SERVICE_PORTS.TYPESENSE,
} as const;

export const CONNECTION_HOSTS = {
    LOCALHOST: DEFAULT_HOSTS.LOCALHOST,
    FTP_EXAMPLE: 'ftp.example.com',
    SFTP_EXAMPLE: 'sftp.example.com',
} as const;

export const HTTP_CONNECTION_DEFAULTS = {
    TIMEOUT_MS: HTTP.TIMEOUT_MS,
    BASE_URL_PLACEHOLDER: 'https://api.example.com',
} as const;

export const DATABASE_PLACEHOLDERS = {
    DATABASE: 'mydb',
    POSTGRES_USER: 'postgres',
    MYSQL_USER: 'root',
} as const;

export const CLOUD_PLACEHOLDERS = {
    S3_BUCKET: 'my-bucket',
    S3_REGION: 'us-east-1',
    S3_ENDPOINT: 'https://s3.amazonaws.com',
} as const;

