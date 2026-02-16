import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import type {
    DataHubSecretListOptions,
} from '../../types';

const secretKeys = {
    all: ['secrets'] as const,
    lists: () => [...secretKeys.all, 'list'] as const,
    list: (options?: DataHubSecretListOptions) => [...secretKeys.lists(), options] as const,
    details: () => [...secretKeys.all, 'detail'] as const,
    detail: (id: string) => [...secretKeys.details(), id] as const,
    codes: () => [...secretKeys.all, 'codes'] as const,
};

export const secretsListDocument = graphql(`
    query DataHubSecretsForList($options: DataHubSecretListOptions) {
        dataHubSecrets(options: $options) {
            items {
                id
                code
                provider
            }
            totalItems
        }
    }
`);

export const secretDetailDocument = graphql(`
    query DataHubSecretDetailApi($id: ID!) {
        dataHubSecret(id: $id) {
            id
            code
            provider
            value
            metadata
        }
    }
`);

export const createSecretDocument = graphql(`
    mutation CreateDataHubSecretApi($input: CreateDataHubSecretInput!) {
        createDataHubSecret(input: $input) {
            id
            code
        }
    }
`);

export const updateSecretDocument = graphql(`
    mutation UpdateDataHubSecretApi($input: UpdateDataHubSecretInput!) {
        updateDataHubSecret(input: $input) {
            id
            code
        }
    }
`);

export const deleteSecretDocument = graphql(`
    mutation DeleteDataHubSecretApi($id: ID!) {
        deleteDataHubSecret(id: $id) {
            result
        }
    }
`);

export function useSecrets(options?: DataHubSecretListOptions) {
    return useQuery({
        queryKey: secretKeys.list(options),
        queryFn: () =>
            api.query(secretsListDocument, { options }).then((res) => res.dataHubSecrets),
    });
}


