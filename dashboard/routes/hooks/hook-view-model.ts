export interface HookEventView {
    readonly name?: string | null;
}

export function isHookStageConfigured(value: unknown): boolean {
    return Array.isArray(value) && value.length > 0;
}

export function getResponsiveHookGridClass(gridClass: string): string {
    return gridClass === 'grid-cols-4'
        ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
        : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3';
}

export function filterHookEvents<T extends HookEventView>(
    events: readonly T[],
    filter: string,
): T[] {
    const normalizedFilter = filter.trim().toLocaleLowerCase();
    if (normalizedFilter === '') return [...events];
    return events.filter(event =>
        (event.name ?? '').toLocaleLowerCase().includes(normalizedFilter),
    );
}
