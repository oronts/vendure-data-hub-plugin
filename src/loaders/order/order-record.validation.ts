export function parseOrderPlacedAt(value: string | Date | undefined): Date | undefined {
    if (value === undefined) return undefined;
    const placedAt = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(placedAt.getTime())) {
        throw new Error('Order placement date must be a valid ISO 8601 date');
    }
    return placedAt;
}
