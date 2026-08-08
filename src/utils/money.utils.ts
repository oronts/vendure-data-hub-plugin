import { ConfigService } from '@vendure/core';

const DEFAULT_MONEY_PRECISION = 2;
const MAX_MONEY_PRECISION = 12;

function parseMajorAmount(value: unknown): number {
    const amount = typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
            ? Number(value)
            : Number.NaN;

    if (!Number.isFinite(amount)) {
        throw new Error('Price must be a finite number');
    }
    if (amount < 0) {
        throw new Error('Price cannot be negative');
    }
    return amount;
}

export function resolveMoneyPrecision(configService: ConfigService): number {
    const precision = configService.entityOptions.moneyStrategy.precision ?? DEFAULT_MONEY_PRECISION;
    if (!Number.isInteger(precision) || precision < 0 || precision > MAX_MONEY_PRECISION) {
        throw new Error(`Money precision must be an integer between 0 and ${MAX_MONEY_PRECISION}`);
    }
    return precision;
}

export function majorToMinorUnits(value: unknown, precision: number): number {
    if (!Number.isInteger(precision) || precision < 0 || precision > MAX_MONEY_PRECISION) {
        throw new Error(`Money precision must be an integer between 0 and ${MAX_MONEY_PRECISION}`);
    }

    const minorUnits = Math.round(parseMajorAmount(value) * 10 ** precision);
    if (!Number.isSafeInteger(minorUnits)) {
        throw new Error('Price exceeds the supported safe integer range');
    }
    return minorUnits;
}

export function minorToMajorUnits(value: unknown, precision: number): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new Error('Minor-unit price must be a non-negative safe integer');
    }
    if (!Number.isInteger(precision) || precision < 0 || precision > MAX_MONEY_PRECISION) {
        throw new Error(`Money precision must be an integer between 0 and ${MAX_MONEY_PRECISION}`);
    }
    return value / 10 ** precision;
}
