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

export const SEARCH_PLACEHOLDERS = {
    ELASTICSEARCH_NODE: 'http://localhost:9200',
} as const;

export function getConnectionPlaceholder(
    type: string,
    field: string,
): string | number | undefined {
    switch (type) {
        case CONNECTION_TYPE.POSTGRES:
            if (field === 'host') return CONNECTION_HOSTS.LOCALHOST;
            if (field === 'port') return CONNECTION_PORTS.POSTGRESQL;
            if (field === 'database') return DATABASE_PLACEHOLDERS.DATABASE;
            if (field === 'username') return DATABASE_PLACEHOLDERS.POSTGRES_USER;
            break;
        case CONNECTION_TYPE.MYSQL:
            if (field === 'host') return CONNECTION_HOSTS.LOCALHOST;
            if (field === 'port') return CONNECTION_PORTS.MYSQL;
            if (field === 'database') return DATABASE_PLACEHOLDERS.DATABASE;
            if (field === 'username') return DATABASE_PLACEHOLDERS.MYSQL_USER;
            break;
        case CONNECTION_TYPE.S3:
            if (field === 'bucket') return CLOUD_PLACEHOLDERS.S3_BUCKET;
            if (field === 'region') return CLOUD_PLACEHOLDERS.S3_REGION;
            if (field === 'endpoint') return CLOUD_PLACEHOLDERS.S3_ENDPOINT;
            break;
        case CONNECTION_TYPE.FTP:
            if (field === 'host') return CONNECTION_HOSTS.FTP_EXAMPLE;
            if (field === 'port') return CONNECTION_PORTS.FTP;
            break;
        case CONNECTION_TYPE.SFTP:
            if (field === 'host') return CONNECTION_HOSTS.SFTP_EXAMPLE;
            if (field === 'port') return CONNECTION_PORTS.SFTP;
            break;
        case CONNECTION_TYPE.HTTP:
            if (field === 'baseUrl') return HTTP_CONNECTION_DEFAULTS.BASE_URL_PLACEHOLDER;
            break;
    }
    return undefined;
}
