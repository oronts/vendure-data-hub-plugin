export function chunk<T>(values: T[], size: number): T[][] {
    if (size <= 0) {
        return values.length > 0 ? [values] : [];
    }
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}
