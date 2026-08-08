import type { ExtractorValidationResult } from '../../types';
import {
    CONNECTION_POOL,
    DatabasePaginationType,
    DatabaseType,
    HTTP,
    PAGINATION,
} from '../../constants';
import { getErrorMessage } from '../../utils/error.utils';
import { validateColumnName } from '../../utils/sql-security.utils';
import { hasLimitClause, validateQuery } from './query-builder';
import type { DatabaseExtractorConfig } from './types';

type ValidationError = ExtractorValidationResult['errors'][number];
type ValidationWarning = NonNullable<ExtractorValidationResult['warnings']>[number];

function validateCursorPagination(
    config: DatabaseExtractorConfig,
    errors: ValidationError[],
): void {
    const pagination = config.pagination;
    if (!pagination?.enabled || pagination.type !== DatabasePaginationType.CURSOR) return;

    if (!pagination.cursorColumn) {
        errors.push({
            field: 'pagination.cursorColumn',
            message: 'Cursor column is required for cursor-based pagination',
        });
    }
    if (!pagination.cursorTieBreakerColumn) {
        errors.push({
            field: 'pagination.cursorTieBreakerColumn',
            message: 'Cursor tie-breaker column is required for cursor-based pagination',
        });
    }
    if (
        pagination.cursorColumn
        && pagination.cursorColumn === pagination.cursorTieBreakerColumn
    ) {
        errors.push({
            field: 'pagination.cursorTieBreakerColumn',
            message: 'Cursor and tie-breaker columns must be different',
        });
    }
    for (const [field, column] of [
        ['pagination.cursorColumn', pagination.cursorColumn],
        ['pagination.cursorTieBreakerColumn', pagination.cursorTieBreakerColumn],
    ] as const) {
        if (!column) continue;
        try {
            validateColumnName(column);
        } catch (error) {
            errors.push({ field, message: getErrorMessage(error) });
        }
    }
}

function validateIncrementalConfig(
    config: DatabaseExtractorConfig,
    errors: ValidationError[],
): void {
    const incremental = config.incremental;
    if (!incremental?.enabled) return;

    if (!incremental.column) {
        errors.push({
            field: 'incremental.column',
            message: 'Incremental column is required when incremental extraction is enabled',
        });
        return;
    }
    try {
        validateColumnName(incremental.column);
    } catch (error) {
        errors.push({ field: 'incremental.column', message: getErrorMessage(error) });
    }

    const pagination = config.pagination;
    if (!pagination?.enabled || pagination.type !== DatabasePaginationType.CURSOR) {
        errors.push({
            field: 'pagination.type',
            message: 'Incremental extraction requires cursor pagination',
        });
        return;
    }
    if (pagination.cursorColumn !== incremental.column) {
        errors.push({
            field: 'pagination.cursorColumn',
            message: 'Cursor column must match the incremental column',
        });
    }
}

function validateTlsConfig(
    config: DatabaseExtractorConfig,
    errors: ValidationError[],
): void {
    const ssl = config.ssl;
    if (!ssl) return;

    const secretFields = [
        ssl.caSecretCode,
        ssl.certSecretCode,
        ssl.keySecretCode,
    ];
    if (config.databaseType === DatabaseType.SQLITE && (
        ssl.enabled || secretFields.some(Boolean)
    )) {
        errors.push({
            field: 'ssl',
            message: 'TLS is not supported for SQLite',
        });
        return;
    }
    if (!ssl.enabled && secretFields.some(Boolean)) {
        errors.push({
            field: 'ssl.enabled',
            message: 'TLS must be enabled when TLS secrets are configured',
        });
    }
    if (Boolean(ssl.certSecretCode) !== Boolean(ssl.keySecretCode)) {
        errors.push({
            field: ssl.certSecretCode
                ? 'ssl.keySecretCode'
                : 'ssl.certSecretCode',
            message: 'TLS client certificate and key secrets must be configured together',
        });
    }
}

export function validateDatabaseExtractorConfig(
    config: DatabaseExtractorConfig,
): ExtractorValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!config.databaseType) {
        errors.push({ field: 'databaseType', message: 'Database type is required' });
    }
    if (config.databaseType && ![
        DatabaseType.POSTGRESQL,
        DatabaseType.MYSQL,
        DatabaseType.SQLITE,
    ].includes(config.databaseType)) {
        errors.push({
            field: 'databaseType',
            message: `${config.databaseType} is not supported by the database extractor`,
        });
    }

    if (!config.query) {
        errors.push({ field: 'query', message: 'SQL query is required' });
    } else {
        const queryValidation = validateQuery(config.query);
        for (const message of queryValidation.errors) {
            errors.push({ field: 'query', message, code: 'INVALID_QUERY' });
        }
        if (config.pagination?.enabled && hasLimitClause(config.query)) {
            warnings.push({
                field: 'query',
                message: 'Query contains LIMIT clause which may conflict with pagination settings',
            });
        }
    }

    if (!config.connectionStringSecretCode && !config.connectionString) {
        if (!config.host && config.databaseType !== DatabaseType.SQLITE) {
            errors.push({ field: 'host', message: 'Host is required' });
        }
        if (!config.database) {
            errors.push({
                field: 'database',
                message: config.databaseType === DatabaseType.SQLITE
                    ? 'SQLite database path is required'
                    : 'Database name is required',
            });
        }
    }

    if (config.port !== undefined && (
        !Number.isSafeInteger(config.port)
        || config.port < 1
        || config.port > 65_535
    )) {
        errors.push({ field: 'port', message: 'Port must be an integer between 1 and 65535' });
    }

    if (config.queryTimeoutMs !== undefined) {
        if (config.databaseType === DatabaseType.SQLITE) {
            errors.push({
                field: 'queryTimeoutMs',
                message: 'queryTimeoutMs is not supported for SQLite',
            });
        } else if (
            !Number.isSafeInteger(config.queryTimeoutMs)
            || config.queryTimeoutMs < 1
            || config.queryTimeoutMs > HTTP.MAX_TIMEOUT_MS
        ) {
            errors.push({
                field: 'queryTimeoutMs',
                message: `Query timeout must be an integer from 1 to ${HTTP.MAX_TIMEOUT_MS} milliseconds`,
            });
        }
    }

    const pagination = config.pagination;
    if (pagination?.enabled) {
        if (
            !Number.isSafeInteger(pagination.pageSize)
            || pagination.pageSize < 1
            || pagination.pageSize > PAGINATION.DATABASE_MAX_PAGE_SIZE
        ) {
            errors.push({
                field: 'pagination.pageSize',
                message: `Page size must be an integer from 1 to ${PAGINATION.DATABASE_MAX_PAGE_SIZE}`,
            });
        }
        if (pagination.maxPages !== undefined && (
            !Number.isSafeInteger(pagination.maxPages)
            || pagination.maxPages < 1
            || pagination.maxPages > PAGINATION.MAX_PAGES
        )) {
            errors.push({
                field: 'pagination.maxPages',
                message: `Max pages must be an integer from 1 to ${PAGINATION.MAX_PAGES}`,
            });
        }
    }
    validateCursorPagination(config, errors);
    validateIncrementalConfig(config, errors);
    validateTlsConfig(config, errors);

    for (const field of ['namedParameters', 'schema', 'includeQueryMetadata'] as const) {
        if (config[field] !== undefined) {
            errors.push({
                field,
                message: `${field} is not supported by the database extractor`,
            });
        }
    }
    const rawPool = config.pool as Record<string, unknown> | undefined;
    if (rawPool?.min !== undefined) {
        errors.push({
            field: 'pool.min',
            message: 'pool.min is not supported by the database extractor',
        });
    }
    if (config.pool?.max !== undefined && (
        !Number.isSafeInteger(config.pool.max)
        || config.pool.max < CONNECTION_POOL.MIN
        || config.pool.max > CONNECTION_POOL.MAX
    )) {
        errors.push({
            field: 'pool.max',
            message: `Pool size must be an integer from ${CONNECTION_POOL.MIN} to ${CONNECTION_POOL.MAX}`,
        });
    }
    if (config.pool?.idleTimeoutMs !== undefined && (
        !Number.isSafeInteger(config.pool.idleTimeoutMs)
        || config.pool.idleTimeoutMs < 1
        || config.pool.idleTimeoutMs > HTTP.MAX_TIMEOUT_MS
    )) {
        errors.push({
            field: 'pool.idleTimeoutMs',
            message: `Pool idle timeout must be an integer from 1 to ${HTTP.MAX_TIMEOUT_MS} milliseconds`,
        });
    }
    if (config.databaseType === DatabaseType.SQLITE && config.pool !== undefined) {
        errors.push({
            field: 'pool',
            message: 'Connection pools are not configurable for SQLite',
        });
    }
    const rawIncremental = config.incremental as Record<string, unknown> | undefined;
    if (rawIncremental?.type !== undefined) {
        errors.push({
            field: 'incremental.type',
            message: 'incremental.type is not supported; the checkpoint value is inferred from the column',
        });
    }

    return { valid: errors.length === 0, errors, warnings };
}
