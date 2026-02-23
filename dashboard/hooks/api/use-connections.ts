import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createQueryKeys } from '../../utils/query-key-factory';
import { QUERY_LIMITS } from '../../constants';
import type {
    DataHubConnectionListOptions,
} from '../../types';

const base = createQueryKeys('connections');
const connectionKeys = {
    ...base,
    list: (options?: DataHubConnectionListOptions) => [...base.lists(), options] as const,
    codes: () => [...base.all, 'codes'] as const,
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

export function useConnectionCodes() {
    return useQuery({
        queryKey: connectionKeys.codes(),
        queryFn: () =>
            api
                .query(connectionsListDocument, { options: { take: QUERY_LIMITS.ALL_ITEMS } })
                .then((res) => res.dataHubConnections.items.map((c) => c.code)),
    });
}

