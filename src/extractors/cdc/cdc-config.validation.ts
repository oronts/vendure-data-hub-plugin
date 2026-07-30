import type { ExtractorValidationResult } from '../../types';
import { PAGINATION } from '../../constants';
import { getErrorMessage } from '../../utils/error.utils';
import { validateColumnName, validateTableName } from '../../utils/sql-security.utils';
import { CDC_DEFAULTS, type CdcExtractorConfig } from './types';

type ValidationError = ExtractorValidationResult['errors'][number];
type ValidationWarning = NonNullable<ExtractorValidationResult['warnings']>[number];

export function resolveCdcBatchSize(config: CdcExtractorConfig): number {
    const batchSize = config.batchSize ?? CDC_DEFAULTS.batchSize;
    if (
        !Number.isSafeInteger(batchSize)
        || batchSize < 1
        || batchSize > PAGINATION.DATABASE_MAX_PAGE_SIZE
    ) {
        throw new Error(
            `Batch size must be an integer from 1 to ${PAGINATION.DATABASE_MAX_PAGE_SIZE}`,
        );
    }
    return batchSize;
}

function validateIdentifier(
    field: string,
    value: string | undefined,
    label: string,
    validate: (candidate: string) => void,
    errors: ValidationError[],
): void {
    if (!value) {
        errors.push({ field, message: `${label} is required` });
        return;
    }
    try {
        validate(value);
    } catch (error) {
        errors.push({ field, message: getErrorMessage(error) });
    }
}

export function validateCdcConfig(
    config: CdcExtractorConfig,
): ExtractorValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!config.databaseType) {
        errors.push({ field: 'databaseType', message: 'Database type is required' });
    } else if (!['POSTGRESQL', 'MYSQL'].includes(config.databaseType)) {
        errors.push({
            field: 'databaseType',
            message: 'Only POSTGRESQL and MYSQL are supported',
        });
    }
    if (!config.connectionCode) {
        errors.push({ field: 'connectionCode', message: 'Connection code is required' });
    }

    validateIdentifier('table', config.table, 'Table name', validateTableName, errors);
    validateIdentifier(
        'trackingColumn',
        config.trackingColumn,
        'Tracking column',
        validateColumnName,
        errors,
    );
    validateIdentifier(
        'primaryKey',
        config.primaryKey,
        'Primary key column',
        validateColumnName,
        errors,
    );

    if (!config.trackingType) {
        errors.push({ field: 'trackingType', message: 'Tracking type is required' });
    } else if (!['TIMESTAMP', 'VERSION'].includes(config.trackingType)) {
        errors.push({
            field: 'trackingType',
            message: 'Tracking type must be TIMESTAMP or VERSION',
        });
    }

    if (config.includeDeletes && !config.deleteColumn) {
        errors.push({
            field: 'deleteColumn',
            message: 'Delete column is required when tracking deletes',
        });
    }
    if (config.deleteColumn) {
        try {
            validateColumnName(config.deleteColumn);
        } catch (error) {
            errors.push({ field: 'deleteColumn', message: getErrorMessage(error) });
        }
    }
    for (const column of config.columns ?? []) {
        try {
            validateColumnName(column);
        } catch (error) {
            errors.push({ field: 'columns', message: getErrorMessage(error) });
        }
    }

    try {
        resolveCdcBatchSize(config);
    } catch (error) {
        errors.push({ field: 'batchSize', message: getErrorMessage(error) });
    }
    if (config.trackingType === 'VERSION') {
        warnings.push({
            message: 'VERSION tracking assumes the column is monotonically increasing. Ensure no gaps or resets occur.',
        });
    }

    return { valid: errors.length === 0, errors, warnings };
}
