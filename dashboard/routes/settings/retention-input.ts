export function retentionDaysInputValue(
    value: number | null | undefined,
): string {
    return value == null ? '' : String(value);
}
