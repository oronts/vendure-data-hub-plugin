/**
 * Default values for route step branch configuration.
 */
export const ROUTE_BRANCH_DEFAULTS = {
    /** Prefix for auto-generated branch names */
    namePrefix: 'branch-',
    /** Maximum number of branches allowed per route step */
    maxBranches: 10,
} as const;
