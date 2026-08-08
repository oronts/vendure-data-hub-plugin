interface NumberRangeOptions {
    fieldName: string;
    defaultValue: number;
    minimum: number;
    maximum: number;
    minimumExclusive?: boolean;
}

export function resolveBoundedInteger(
    value: unknown,
    options: NumberRangeOptions,
): number {
    const resolved = value === undefined ? options.defaultValue : value;
    if (
        typeof resolved !== 'number'
        || !Number.isSafeInteger(resolved)
        || (options.minimumExclusive
            ? resolved <= options.minimum
            : resolved < options.minimum)
        || resolved > options.maximum
    ) {
        throw new Error(
            `${options.fieldName} must be an integer from ${options.minimum} to ${options.maximum}`,
        );
    }
    return resolved;
}

export function resolveBoundedNumber(
    value: unknown,
    options: NumberRangeOptions,
): number {
    const resolved = value === undefined ? options.defaultValue : value;
    if (
        typeof resolved !== 'number'
        || !Number.isFinite(resolved)
        || (options.minimumExclusive
            ? resolved <= options.minimum
            : resolved < options.minimum)
        || resolved > options.maximum
    ) {
        throw new Error(
            options.minimumExclusive
                ? `${options.fieldName} must be a number greater than ${options.minimum} and at most ${options.maximum}`
                : `${options.fieldName} must be a number from ${options.minimum} to ${options.maximum}`,
        );
    }
    return resolved;
}
