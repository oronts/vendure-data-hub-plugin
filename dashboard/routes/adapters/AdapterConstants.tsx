export const ADAPTERS_TABLE_PAGE_SIZE = 25;

/** UI helper: default example values per schema field type for adapter detail display */
const EXAMPLE_VALUES: Record<string, unknown> = {
    number: 1000,
    boolean: true,
    select: 'value',
    json: {},
    array: [],
};

export function guessExampleValue(
    type: string,
    options?: Array<{ value: string; label: string }> | null,
): unknown {
    if (options && options.length > 0) {
        return options[0].value;
    }
    return EXAMPLE_VALUES[type] ?? 'value';
}
