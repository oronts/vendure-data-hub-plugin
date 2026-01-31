import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createMutationErrorHandler } from './mutation-helpers';
import { QUERY_LIMITS } from '../../constants';
import type {
    DataHubConnectionListOptions,
    CreateDataHubConnectionInput,
    UpdateDataHubConnectionInput,
} from '../../types';

export const connectionKeys = {
    all: ['connections'] as const,
    lists: () => [...connectionKeys.all, 'list'] as const,
    list: (options?: DataHubConnectionListOptions) => [...connectionKeys.lists(), options] as const,
    details: () => [...connectionKeys.all, 'detail'] as const,
    detail: (id: string) => [...connectionKeys.details(), id] as const,
    codes: () => [...connectionKeys.all, 'codes'] as const,
};

export const connectionsListDocument = graphql(`
    query DataHubConnectionsForList($options: DataHubConnectionListOptions) {
        dataHubConnections(options: $options) {
            items {
                id
                code
                type
            }
            totalItems
        }
    }
`);

export const connectionDetailDocument = graphql(`
    query DataHubConnectionDetailApi($id: ID!) {
        dataHubConnection(id: $id) {
            id
            code
            type
            config
        }
    }
`);

export const createConnectionDocument = graphql(`
    mutation CreateDataHubConnectionApi($input: CreateDataHubConnectionInput!) {
        createDataHubConnection(input: $input) {
            id
            code
        }
    }
`);

export const updateConnectionDocument = graphql(`
    mutation UpdateDataHubConnectionApi($input: UpdateDataHubConnectionInput!) {
        updateDataHubConnection(input: $input) {
            id
            code
        }
    }
`);

export const deleteConnectionDocument = graphql(`
    mutation DeleteDataHubConnectionApi($id: ID!) {
        deleteDataHubConnection(id: $id) {
            result
        }
    }
`);

export function useConnections(options?: DataHubConnectionListOptions) {
    return useQuery({
        queryKey: connectionKeys.list(options),
        queryFn: () =>
            api.query(connectionsListDocument, { options }).then((res) => res.dataHubConnections),
    });
}

export function useConnection(id: string | undefined) {
    return useQuery({
        queryKey: connectionKeys.detail(id ?? ''),
        queryFn: () =>
            api.query(connectionDetailDocument, { id: id! }).then((res) => res.dataHubConnection),
        enabled: !!id,
    });
}

export function useConnectionCodes() {
    return useQuery({
        queryKey: connectionKeys.codes(),
        queryFn: () =>
            api
                .query(connectionsListDocument, { options: { take: QUERY_LIMITS.ALL_ITEMS } })
                .then((res) => res.dataHubConnections.items.map((c) => c.code)),
    });
}

export function useCreateConnection() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: CreateDataHubConnectionInput) =>
            api.mutate(createConnectionDocument, { input }).then((res) => res.createDataHubConnection),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: connectionKeys.lists() });
            queryClient.invalidateQueries({ queryKey: connectionKeys.codes() });
        },
        onError: createMutationErrorHandler('create connection'),
    });
}

export function useUpdateConnection() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: UpdateDataHubConnectionInput) =>
            api.mutate(updateConnectionDocument, { input }).then((res) => res.updateDataHubConnection),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: connectionKeys.lists() });
            queryClient.invalidateQueries({ queryKey: connectionKeys.codes() });
            if (data?.id) {
                queryClient.invalidateQueries({ queryKey: connectionKeys.detail(String(data.id)) });
            }
        },
        onError: createMutationErrorHandler('update connection'),
    });
}

export function useDeleteConnection() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) =>
            api.mutate(deleteConnectionDocument, { id }).then((res) => res.deleteDataHubConnection),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: connectionKeys.lists() });
            queryClient.invalidateQueries({ queryKey: connectionKeys.codes() });
        },
        onError: createMutationErrorHandler('delete connection'),
    });
}
