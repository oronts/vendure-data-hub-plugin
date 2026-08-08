export interface PaginatedListPage {
    readonly items: readonly unknown[];
    readonly totalItems: number;
}

export function getNextListPageOffset(
    pages: readonly PaginatedListPage[],
): number | undefined {
    const lastPage = pages[pages.length - 1];
    if (!lastPage || lastPage.items.length === 0) return undefined;
    const loadedItems = pages.reduce((total, page) => total + page.items.length, 0);
    const totalItems = lastPage.totalItems;
    return loadedItems < totalItems ? loadedItems : undefined;
}
