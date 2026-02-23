import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createQueryKeys } from '../../utils/query-key-factory';
import type {
    DataHubSecretListOptions,
} from '../../types';

const base = createQueryKeys('secrets');
const secretKeys = {
    ...base,
    list: (options?: DataHubSecretListOptions) => [...base.lists(), options] as const,
    codes: () => [...base.all, 'codes'] as const,
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


