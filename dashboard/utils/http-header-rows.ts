export function rekeyHttpHeaderRow(
    rowIds: Map<string, string>,
    previousName: string,
    nextName: string,
    rowId: string,
): void {
    const previousKey = previousName.trim();
    const nextKey = nextName.trim();

    if (previousKey && rowIds.get(previousKey) === rowId) {
        rowIds.delete(previousKey);
    }
    if (nextKey) {
        rowIds.set(nextKey, rowId);
    }
}

export function upsertHttpHeaderRow<T extends { id: string; name: string }>(
    rows: readonly T[],
    row: T,
): T[] {
    const otherRows = rows.filter(item => item.id !== row.id);
    return row.name.trim() ? [...otherRows, row] : otherRows;
}
