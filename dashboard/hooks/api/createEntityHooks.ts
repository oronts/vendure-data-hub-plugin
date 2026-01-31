import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { createMutationErrorHandler } from './mutation-helpers';

export interface ListOptions {
    take?: number;
    skip?: number;
    sort?: Record<string, 'ASC' | 'DESC'>;
    filter?: Record<string, unknown>;
}

export interface PaginatedList<T> {
    items: T[];
    totalItems: number;
}

export function createQueryKeys(entityName: string) {
    return {
        all: [entityName] as const,
        lists: () => [...createQueryKeys(entityName).all, 'list'] as const,
        list: (options?: ListOptions) => [...createQueryKeys(entityName).lists(), options] as const,
        details: () => [...createQueryKeys(entityName).all, 'detail'] as const,
        detail: (id: string) => [...createQueryKeys(entityName).details(), id] as const,
    };
}

export interface EntityHooksConfig<TList, TDetail, TCreateInput, TUpdateInput> {
    entityName: string;
    listDocument: TypedDocumentNode<Record<string, PaginatedList<TList>>, { options?: ListOptions }>;
    detailDocument?: TypedDocumentNode<Record<string, TDetail | null>, { id: string }>;
    createDocument?: TypedDocumentNode<Record<string, TDetail>, { input: TCreateInput }>;
    updateDocument?: TypedDocumentNode<Record<string, TDetail>, { input: TUpdateInput }>;
    deleteDocument?: TypedDocumentNode<Record<string, { success: boolean }>, { id: string }>;
    listResultKey: string;
    detailResultKey?: string;
    createResultKey?: string;
    updateResultKey?: string;
}

export function createEntityHooks<TList, TDetail, TCreateInput = unknown, TUpdateInput = unknown>(
    config: EntityHooksConfig<TList, TDetail, TCreateInput, TUpdateInput>
) {
    const keys = createQueryKeys(config.entityName);

    function useList(options?: ListOptions) {
        return useQuery({
            queryKey: keys.list(options),
            queryFn: async () => {
                const res = await api.query(config.listDocument, { options });
                return res[config.listResultKey] as PaginatedList<TList>;
            },
        });
    }

    function useDetail(id: string | undefined) {
        return useQuery({
            queryKey: keys.detail(id ?? ''),
            queryFn: async () => {
                if (!config.detailDocument || !config.detailResultKey) {
                    throw new Error(`Detail document not configured for ${config.entityName}`);
                }
                const res = await api.query(config.detailDocument, { id: id! });
                return res[config.detailResultKey] as TDetail | null;
            },
            enabled: !!id && !!config.detailDocument,
        });
    }

    function useCreate() {
        const queryClient = useQueryClient();
        return useMutation({
            mutationFn: async (input: TCreateInput) => {
                if (!config.createDocument || !config.createResultKey) {
                    throw new Error(`Create document not configured for ${config.entityName}`);
                }
                const res = await api.mutate(config.createDocument, { input });
                return res[config.createResultKey] as TDetail;
            },
            onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: keys.lists() });
            },
            onError: createMutationErrorHandler(`create ${config.entityName}`),
        });
    }

    function useUpdate() {
        const queryClient = useQueryClient();
        return useMutation({
            mutationFn: async (input: TUpdateInput) => {
                if (!config.updateDocument || !config.updateResultKey) {
                    throw new Error(`Update document not configured for ${config.entityName}`);
                }
                const res = await api.mutate(config.updateDocument, { input });
                return res[config.updateResultKey] as TDetail;
            },
            onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: keys.all });
            },
            onError: createMutationErrorHandler(`update ${config.entityName}`),
        });
    }

    function useDelete() {
        const queryClient = useQueryClient();
        return useMutation({
            mutationFn: async (id: string) => {
                if (!config.deleteDocument) {
                    throw new Error(`Delete document not configured for ${config.entityName}`);
                }
                return api.mutate(config.deleteDocument, { id });
            },
            onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: keys.lists() });
            },
            onError: createMutationErrorHandler(`delete ${config.entityName}`),
        });
    }

    return {
        keys,
        useList,
        useDetail,
        useCreate,
        useUpdate,
        useDelete,
    };
}
