/**
 * Query Key Factory
 *
 * Generates standardized TanStack Query key structures for API hooks.
 * Ensures consistent cache key patterns across all data-fetching hooks.
 *
 * Standard key hierarchy:
 *   [baseName]                           -> all (for broad invalidation)
 *   [baseName, 'list']                   -> lists (invalidate all lists)
 *   [baseName, 'list', options]          -> list (specific list query)
 *   [baseName, 'detail']                 -> details (invalidate all details)
 *   [baseName, 'detail', id]            -> detail (specific detail query)
 */

/**
 * Standard query key structure returned by createQueryKeys.
 *
 * Hook files extend this with domain-specific keys as needed
 * (e.g. `timeline`, `errors`, `codes`).
 */
export interface StandardQueryKeys {
    all: readonly [string];
    lists: () => readonly [string, string];
    list: (...args: Array<string | number | Record<string, unknown> | undefined>) => readonly unknown[];
    details: () => readonly [string, string];
    detail: (id: string) => readonly [string, string, string];
}

/**
 * Creates a standard query key factory for a given base entity name.
 *
 * @param baseName  The root key segment (e.g. 'pipelines', 'connections', 'secrets')
 * @returns An object with `all`, `lists()`, `list(...)`, `details()`, `detail(id)` key builders
 *
 * @example
 * ```ts
 * const keys = createQueryKeys('pipelines');
 * keys.all          // ['pipelines']
 * keys.lists()      // ['pipelines', 'list']
 * keys.list(opts)   // ['pipelines', 'list', opts]
 * keys.details()    // ['pipelines', 'detail']
 * keys.detail('1')  // ['pipelines', 'detail', '1']
 * ```
 */
export function createQueryKeys(baseName: string): StandardQueryKeys {
    const all = [baseName] as const;
    return {
        all,
        lists: () => [...all, 'list'] as const,
        list: (...args: Array<string | number | Record<string, unknown> | undefined>) => [...all, 'list', ...args] as const,
        details: () => [...all, 'detail'] as const,
        detail: (id: string) => [...all, 'detail', id] as const,
    };
}
