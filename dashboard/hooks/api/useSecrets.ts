import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createMutationErrorHandler } from './mutation-helpers';
import type {
    DataHubSecretListOptions,
    CreateDataHubSecretInput,
    UpdateDataHubSecretInput,
} from '../../types';

export const secretKeys = {
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

export function useSecret(id: string | undefined) {
    return useQuery({
        queryKey: secretKeys.detail(id ?? ''),
        queryFn: () =>
            api.query(secretDetailDocument, { id: id! }).then((res) => res.dataHubSecret),
        enabled: !!id,
    });
}

export function useCreateSecret() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: CreateDataHubSecretInput) =>
            api.mutate(createSecretDocument, { input }).then((res) => res.createDataHubSecret),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: secretKeys.lists() });
            queryClient.invalidateQueries({ queryKey: secretKeys.codes() });
        },
        onError: createMutationErrorHandler('create secret'),
    });
}

export function useUpdateSecret() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: UpdateDataHubSecretInput) =>
            api.mutate(updateSecretDocument, { input }).then((res) => res.updateDataHubSecret),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: secretKeys.lists() });
            queryClient.invalidateQueries({ queryKey: secretKeys.codes() });
            if (data?.id) {
                queryClient.invalidateQueries({ queryKey: secretKeys.detail(String(data.id)) });
            }
        },
        onError: createMutationErrorHandler('update secret'),
    });
}

export function useDeleteSecret() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) =>
            api.mutate(deleteSecretDocument, { id }).then((res) => res.deleteDataHubSecret),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: secretKeys.lists() });
            queryClient.invalidateQueries({ queryKey: secretKeys.codes() });
        },
        onError: createMutationErrorHandler('delete secret'),
    });
}
