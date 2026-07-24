import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createQueryKeys } from '../../utils/query-key-factory';
import {
    asVendureListDocument,
    normalizeVendureListOptions,
} from '../../utils/vendure-list-document';
import type {
    DataHubConnectionListOptions,
} from '../../types';
import { createCodeReferenceListOptions } from '../../utils/reference-list-options';
import { getNextListPageOffset } from '../../utils/paginated-list';

const base = createQueryKeys('connections');
const connectionKeys = {
    ...base,
    list: (options?: DataHubConnectionListOptions) => [...base.lists(), options] as const,
    references: (searchTerm: string) => [
        ...base.lists(),
        'references',
        searchTerm,
    ] as const,
};

export const connectionsListDocument = asVendureListDocument(graphql(`
    query DataHubConnectionsForList($options: DataHubConnectionListOptions) {
        dataHubConnections(options: $options) {
            items {
                id
                code
                type
                configurationSource
            }
            totalItems
        }
    }
`));

export const connectionDetailDocument = graphql(`
    query DataHubConnectionDetailApi($id: ID!) {
        dataHubConnection(id: $id) {
            id
            code
            type
            configurationSource
            config
            channels { id code token }
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

export const assignConnectionsToChannelDocument = graphql(`
    mutation AssignDataHubConnectionsToChannelApi($input: AssignDataHubConnectionsToChannelInput!) {
        assignDataHubConnectionsToChannel(input: $input) { id channels { id code token } }
    }
`);

export const removeConnectionsFromChannelDocument = graphql(`
    mutation RemoveDataHubConnectionsFromChannelApi($input: AssignDataHubConnectionsToChannelInput!) {
        removeDataHubConnectionsFromChannel(input: $input) { id }
    }
`);

export function useConnections(options?: DataHubConnectionListOptions) {
    return useQuery({
        queryKey: connectionKeys.list(options),
        queryFn: () =>
            api.query(connectionsListDocument, {
                options: normalizeVendureListOptions(options),
            }).then((res) => res.dataHubConnections),
    });
}

export function useInfiniteConnectionReferences(
    searchTerm: string,
    enabled = true,
) {
    const options = createCodeReferenceListOptions(searchTerm);
    return useInfiniteQuery({
        queryKey: connectionKeys.references(searchTerm.trim()),
        queryFn: ({ pageParam }) => api
            .query(connectionsListDocument, {
                options: normalizeVendureListOptions({
                    ...options,
                    skip: pageParam,
                }),
            })
            .then(response => response.dataHubConnections),
        initialPageParam: 0,
        getNextPageParam: (_lastPage, pages) => getNextListPageOffset(pages),
        enabled,
    });
}
