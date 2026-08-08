import type { ExtractorContext, JsonObject } from '../../types';
import { DatabaseType } from '../../constants';
import { resolveConnectionBackedConfig } from '../shared/connection-backed-config';
import type { DatabaseExtractorConfig, DatabaseSslConfig } from './types';

const DATABASE_CONNECTION_TYPES = ['POSTGRES', 'MYSQL'] as const;

interface SavedDatabaseTlsConfig {
    sslRejectUnauthorized?: boolean;
    sslCaSecretCode?: string;
    sslCertSecretCode?: string;
    sslKeySecretCode?: string;
}

function resolveSavedDatabaseTls(
    ssl: DatabaseExtractorConfig['ssl'] | boolean | undefined,
    flatConfig: SavedDatabaseTlsConfig,
): DatabaseSslConfig | undefined {
    if (typeof ssl === 'object') return ssl;
    const hasCertificateSecrets = Boolean(
        flatConfig.sslCaSecretCode
        || flatConfig.sslCertSecretCode
        || flatConfig.sslKeySecretCode,
    );
    if (ssl === undefined && !hasCertificateSecrets) return undefined;

    return {
        enabled: ssl ?? false,
        ...(flatConfig.sslRejectUnauthorized !== undefined
            ? { rejectUnauthorized: flatConfig.sslRejectUnauthorized }
            : {}),
        ...(flatConfig.sslCaSecretCode
            ? { caSecretCode: flatConfig.sslCaSecretCode }
            : {}),
        ...(flatConfig.sslCertSecretCode
            ? { certSecretCode: flatConfig.sslCertSecretCode }
            : {}),
        ...(flatConfig.sslKeySecretCode
            ? { keySecretCode: flatConfig.sslKeySecretCode }
            : {}),
    };
}

export async function resolveDatabaseExtractorConfig(
    context: ExtractorContext,
    config: DatabaseExtractorConfig,
): Promise<DatabaseExtractorConfig> {
    const resolved = await resolveConnectionBackedConfig(
        context,
        config as unknown as JsonObject,
        DATABASE_CONNECTION_TYPES,
    );
    const inferredType = resolved.connectionType === 'POSTGRES'
        ? DatabaseType.POSTGRESQL
        : resolved.connectionType === 'MYSQL'
            ? DatabaseType.MYSQL
            : undefined;
    const resolvedConfig = resolved.config as unknown as DatabaseExtractorConfig
        & SavedDatabaseTlsConfig;
    const {
        sslRejectUnauthorized,
        sslCaSecretCode,
        sslCertSecretCode,
        sslKeySecretCode,
        ...databaseConfig
    } = resolvedConfig;

    return {
        ...databaseConfig,
        databaseType: inferredType ?? databaseConfig.databaseType,
        ssl: resolveSavedDatabaseTls(databaseConfig.ssl, {
            sslRejectUnauthorized,
            sslCaSecretCode,
            sslCertSecretCode,
            sslKeySecretCode,
        }),
    };
}
