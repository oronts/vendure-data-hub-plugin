import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { createMutationErrorHandler } from './mutation-helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Standard paginated list shape returned by Vendure list queries. */
interface PaginatedList<TItem> {
    items: TItem[];
    totalItems: number;
}

/**
 * Configuration for the CRUD hook factory.
 *
 * Generic parameters:
 *  - TListResult    - full GraphQL result type for the list query
 *  - TDetailResult  - full GraphQL result type for the detail query
 *  - TCreateInput   - the mutation input variable for create
 *  - TCreateResult  - full GraphQL result type for the create mutation
 *  - TUpdateInput   - the mutation input variable for update
 *  - TUpdateResult  - full GraphQL result type for the update mutation
 *  - TDeleteResult  - full GraphQL result type for the delete mutation
 *  - TListItem      - shape of a single item inside the paginated list
 *  - TDetail        - shape of the entity returned by the detail query
 *  - TCreated       - shape of the entity returned by the create mutation
 *  - TUpdated       - shape of the entity returned by the update mutation
 */
export interface EntityCrudConfig<
    TListResult,
    TDetailResult,
    TCreateInput,
    TCreateResult,
    TUpdateInput,
    TUpdateResult,
    TDeleteResult,
    TListItem,
    TDetail,
    TCreated,
    TUpdated,
> {
    /** Human-readable entity name used in error toasts (e.g. "connection"). */
    entityName: string;

    /** Prefix for TanStack Query keys (e.g. "connections"). */
    keyPrefix: string;

    /**
     * GraphQL typed documents for all five CRUD operations.
     *
     * Typed as `any` to accommodate both fully-typed `TypedDocumentNode` values
     * (when codegen recognises the query string) and untyped fallbacks (when
     * the operation name was renamed after codegen ran). The extractors below
     * provide runtime type narrowing regardless.
     */
    documents: {
        list: any;
        detail: any;
        create: any;
        update: any;
        delete: any;
    };

    /**
     * Extractors pull the domain data out of the full GraphQL result envelope.
     * Each function receives the raw result and returns the relevant payload.
     */
    extractors: {
        list: (result: TListResult) => PaginatedList<TListItem>;
        detail: (result: TDetailResult) => TDetail | null | undefined;
        create: (result: TCreateResult) => TCreated;
        update: (result: TUpdateResult) => TUpdated;
        delete: (result: TDeleteResult) => unknown;
    };

    /**
     * If true, the generated key factory includes a `codes()` key and all
     * mutations will also invalidate it. Useful for entities whose codes are
     * fetched separately (e.g. connections).
     * @default false
     */
    hasCodes?: boolean;
}

// ---------------------------------------------------------------------------
// Query key factory type
// ---------------------------------------------------------------------------

export interface EntityQueryKeys<TOptions> {
    all: readonly string[];
    lists: () => readonly string[];
    list: (options?: TOptions) => readonly unknown[];
    details: () => readonly string[];
    detail: (id: string) => readonly string[];
    codes: () => readonly string[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a set of standardized CRUD hooks for a Vendure Data Hub entity.
 *
 * This eliminates the boilerplate that is otherwise copy-pasted across
 * useConnections, useSecrets, and any future entity hook files.
 *
 * @example
 * ```ts
 * const connectionCrud = createEntityCrudHooks({ ... });
 *
 * // Re-export with domain-specific names
 * export const connectionKeys = connectionCrud.keys;
 * export const useConnections = connectionCrud.useList;
 * export const useConnection = connectionCrud.useDetail;
 * ```
 */
export function createEntityCrudHooks<
    TListResult,
    TDetailResult,
    TCreateInput,
    TCreateResult,
    TUpdateInput,
    TUpdateResult,
    TDeleteResult,
    TListItem,
    TDetail,
    TCreated extends { id?: string | number | null },
    TUpdated extends { id?: string | number | null },
    TOptions = undefined,
>(config: EntityCrudConfig<
    TListResult, TDetailResult,
    TCreateInput, TCreateResult,
    TUpdateInput, TUpdateResult,
    TDeleteResult,
    TListItem, TDetail, TCreated, TUpdated
>) {
    const { entityName, keyPrefix, documents, extractors, hasCodes = false } = config;

    // -- Query key factory --------------------------------------------------

    const keys: EntityQueryKeys<TOptions> = {
        all: [keyPrefix] as const,
        lists: () => [keyPrefix, 'list'] as const,
        list: (options?: TOptions) => [keyPrefix, 'list', options] as const,
        details: () => [keyPrefix, 'detail'] as const,
        detail: (id: string) => [keyPrefix, 'detail', id] as const,
        codes: () => [keyPrefix, 'codes'] as const,
    };

    // -- Shared invalidation helper -----------------------------------------

    function invalidateListsAndCodes(queryClient: ReturnType<typeof useQueryClient>) {
        queryClient.invalidateQueries({ queryKey: keys.lists() });
        if (hasCodes) {
            queryClient.invalidateQueries({ queryKey: keys.codes() });
        }
    }

    // -- Hooks --------------------------------------------------------------

    function useList(options?: TOptions) {
        return useQuery({
            queryKey: keys.list(options),
            queryFn: () =>
                api.query(documents.list, { options })
                    .then((res: any) => extractors.list(res as TListResult)),
        });
    }

    function useDetail(id: string | undefined) {
        return useQuery({
            queryKey: keys.detail(id ?? ''),
            queryFn: () =>
                api.query(documents.detail, { id: id! })
                    .then((res: any) => extractors.detail(res as TDetailResult)),
            enabled: !!id,
        });
    }

    function useCreate() {
        const queryClient = useQueryClient();

        return useMutation({
            mutationFn: (input: TCreateInput) =>
                api.mutate(documents.create, { input })
                    .then((res: any) => extractors.create(res as TCreateResult)),
            onSuccess: () => {
                invalidateListsAndCodes(queryClient);
            },
            onError: createMutationErrorHandler(`create ${entityName}`),
        });
    }

    function useUpdate() {
        const queryClient = useQueryClient();

        return useMutation({
            mutationFn: (input: TUpdateInput) =>
                api.mutate(documents.update, { input })
                    .then((res: any) => extractors.update(res as TUpdateResult)),
            onSuccess: (data) => {
                invalidateListsAndCodes(queryClient);
                if (data?.id) {
                    queryClient.invalidateQueries({
                        queryKey: keys.detail(String(data.id)),
                    });
                }
            },
            onError: createMutationErrorHandler(`update ${entityName}`),
        });
    }

    function useDelete() {
        const queryClient = useQueryClient();

        return useMutation({
            mutationFn: (id: string) =>
                api.mutate(documents.delete, { id })
                    .then((res: any) => extractors.delete(res as TDeleteResult)),
            onSuccess: () => {
                invalidateListsAndCodes(queryClient);
            },
            onError: createMutationErrorHandler(`delete ${entityName}`),
        });
    }

    return { keys, useList, useDetail, useCreate, useUpdate, useDelete };
}
