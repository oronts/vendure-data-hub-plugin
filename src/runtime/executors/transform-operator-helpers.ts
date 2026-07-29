import * as crypto from 'crypto';
import type { RequestContext } from '@vendure/core';
import type { ConnectionService } from '../../services/config/connection.service';
import type { SecretService } from '../../services/config/secret.service';
import type { AdapterOperatorHelpers, OperatorContext } from '../../sdk/types';
import type { OperatorSecretResolver } from '../../sdk/types/transform-types';
import type { JsonObject, JsonValue } from '../../types';
import type { ExecutorContext, RecordObject } from '../executor-types';
import {
    getPath,
    removePath,
    setPath,
    unitFactor,
} from '../utils';
import { createConnectionsAdapter } from './context-adapters';

const OPERATOR_CHECKPOINTS_KEY = '__operatorCheckpoints';

interface OperatorHelperOptions {
    ctx: RequestContext;
    operatorContext: OperatorContext;
    executorContext: ExecutorContext;
    operatorStateKey: string;
    secretService?: SecretService;
    connectionService?: ConnectionService;
}

function asJsonObject(value: JsonValue | undefined): JsonObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as JsonObject
        : {};
}

export function createOptionalSecretResolver(
    secretService: SecretService | undefined,
    ctx: RequestContext,
): OperatorSecretResolver | undefined {
    if (!secretService) return undefined;

    return {
        get: async code => {
            try {
                return await secretService.resolve(ctx, code) ?? undefined;
            } catch {
                return undefined;
            }
        },
    };
}

export function createOperatorHelpers(
    options: OperatorHelperOptions,
): AdapterOperatorHelpers {
    const {
        ctx,
        operatorContext,
        secretService,
        connectionService,
    } = options;
    return {
        ctx: operatorContext,
        secrets: createOptionalSecretResolver(secretService, ctx),
        ...(connectionService
            ? { connections: createConnectionsAdapter(connectionService, ctx) }
            : {}),
        ...createCheckpointHelpers(options),
        ...createPathHelpers(),
        lookup: async () => undefined,
        format: createFormatHelpers(),
        convert: createConversionHelpers(),
        crypto: createCryptoHelpers(),
    };
}

function createCheckpointHelpers(
    options: OperatorHelperOptions,
): Pick<AdapterOperatorHelpers, 'checkpoint' | 'setCheckpoint'> {
    const { executorContext, operatorContext, operatorStateKey } = options;
    const stepCheckpoint = executorContext.cpData?.[operatorContext.stepKey];
    const operatorCheckpoints = asJsonObject(
        stepCheckpoint?.[OPERATOR_CHECKPOINTS_KEY],
    );
    return {
        checkpoint: asJsonObject(operatorCheckpoints[operatorStateKey]),
        setCheckpoint: checkpoint => {
            setOperatorCheckpoint(
                executorContext,
                operatorContext.stepKey,
                operatorStateKey,
                checkpoint,
            );
        },
    };
}

function createPathHelpers(): Pick<
    AdapterOperatorHelpers,
    'get' | 'set' | 'remove'
> {
    return {
        get: (record, path) => getPath(record as RecordObject, path),
        set: (record, path, value) => {
            setPath(record as RecordObject, path, value);
        },
        remove: (record, path) => {
            removePath(record, path);
        },
    };
}

function createFormatHelpers(): AdapterOperatorHelpers['format'] {
    return {
        currency: (amount, currencyCode, locale = 'en-US') => (
            new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: currencyCode,
            }).format(amount)
        ),
        date: formatDate,
        number: (value, decimals = 2, locale = 'en-US') => (
            new Intl.NumberFormat(locale, {
                maximumFractionDigits: decimals,
            }).format(value)
        ),
        template: (template, data) => (
            template.replace(/\{\{([^}]+)\}\}/g, (_match, path) => {
                const value = getPath(
                    data as RecordObject,
                    String(path).trim(),
                );
                return value == null ? '' : String(value);
            })
        ),
    };
}

function createConversionHelpers(): AdapterOperatorHelpers['convert'] {
    return {
        toMinorUnits: (amount, decimals = 2) => (
            Math.round(amount * Math.pow(10, decimals))
        ),
        fromMinorUnits: (amount, decimals = 2) => (
            amount / Math.pow(10, decimals)
        ),
        unit: (value, from, to) => unitFactor(from, to) * value,
        parseDate,
    };
}

function createCryptoHelpers(): AdapterOperatorHelpers['crypto'] {
    return {
        hash: (value, algorithm = 'sha256') => {
            if (algorithm !== 'sha256' && algorithm !== 'sha512') {
                throw new Error(
                    `Unsupported hash algorithm: ${String(algorithm)}`,
                );
            }
            return crypto.createHash(algorithm).update(value).digest('hex');
        },
        hmac: (value, secret, algorithm = 'sha256') => (
            crypto.createHmac(algorithm, secret).update(value).digest('hex')
        ),
        uuid: () => crypto.randomUUID(),
    };
}

function setOperatorCheckpoint(
    executorContext: ExecutorContext,
    stepKey: string,
    operatorStateKey: string,
    checkpoint: JsonObject,
): void {
    if (!executorContext.cpData) return;

    const stepCheckpoint = executorContext.cpData[stepKey] ?? {};
    const operatorCheckpoints = asJsonObject(
        stepCheckpoint[OPERATOR_CHECKPOINTS_KEY],
    );
    executorContext.cpData[stepKey] = {
        ...stepCheckpoint,
        [OPERATOR_CHECKPOINTS_KEY]: {
            ...operatorCheckpoints,
            [operatorStateKey]: checkpoint,
        },
    };
    executorContext.markCheckpointDirty();
}

function formatDate(
    input: Date | string | number,
    format?: string,
): string {
    const value = new Date(input);
    if (!format || format === 'iso') return value.toISOString();

    return format
        .replace('YYYY', String(value.getUTCFullYear()))
        .replace('MM', String(value.getUTCMonth() + 1).padStart(2, '0'))
        .replace('DD', String(value.getUTCDate()).padStart(2, '0'))
        .replace('HH', String(value.getUTCHours()).padStart(2, '0'))
        .replace('mm', String(value.getUTCMinutes()).padStart(2, '0'))
        .replace('ss', String(value.getUTCSeconds()).padStart(2, '0'));
}

function parseDate(value: string, format?: string): Date | null {
    if (format && /^[YMDHms\-/.\s:]+$/.test(format)) {
        const yearIndex = format.indexOf('YYYY');
        const monthIndex = format.indexOf('MM');
        const dayIndex = format.indexOf('DD');
        if (yearIndex >= 0 && monthIndex >= 0 && dayIndex >= 0) {
            const year = Number.parseInt(
                value.substring(yearIndex, yearIndex + 4),
                10,
            );
            const month = Number.parseInt(
                value.substring(monthIndex, monthIndex + 2),
                10,
            ) - 1;
            const day = Number.parseInt(
                value.substring(dayIndex, dayIndex + 2),
                10,
            );
            if (
                !Number.isNaN(year)
                && !Number.isNaN(month)
                && !Number.isNaN(day)
            ) {
                const parsed = new Date(Date.UTC(year, month, day));
                return Number.isNaN(parsed.getTime()) ? null : parsed;
            }
        }
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
