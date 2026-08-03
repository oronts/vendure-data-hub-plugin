interface NumberRangeOptions {
    fieldName: string;
    defaultValue: number;
    minimum: number;
    maximum: number;
}

export function resolveBoundedInteger(
    value: unknown,
    options: NumberRangeOptions,
): number {
    const resolved = value === undefined ? options.defaultValue : value;
    if (
        typeof resolved !== 'number'
        || !Number.isSafeInteger(resolved)
        || resolved < options.minimum
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
        || resolved < options.minimum
        || resolved > options.maximum
    ) {
        throw new Error(
            `${options.fieldName} must be a number from ${options.minimum} to ${options.maximum}`,
        );
    }
    return resolved;
}
