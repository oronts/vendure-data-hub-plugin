import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createQueryKeys } from '../../utils/query-key-factory';
import type { DataHubSecretListOptions } from '../../types';
import {
    asVendureListDocument,
    normalizeVendureListOptions,
} from '../../utils/vendure-list-document';
import { createCodeReferenceListOptions } from '../../utils/reference-list-options';
import { getNextListPageOffset } from '../../utils/paginated-list';

const base = createQueryKeys('secrets');
const secretKeys = {
    ...base,
    list: (options?: DataHubSecretListOptions) => [...base.lists(), options] as const,
    codes: () => [...base.all, 'codes'] as const,
    security: () => [...base.all, 'security'] as const,
    references: (searchTerm: string) => [
        ...base.lists(),
        'references',
        searchTerm,
    ] as const,
};

export const secretsListDocument = asVendureListDocument(graphql(`
    query DataHubSecretsForList($options: DataHubSecretListOptions) {
        dataHubSecrets(options: $options) {
            items {
                id
                code
                provider
                valueStatus
                isOverridden
            }
            totalItems
        }
    }
`));

export const secretDetailDocument = graphql(`
    query DataHubSecretDetailApi($id: ID!) {
        dataHubSecret(id: $id) {
            id
            code
            provider
            hasValue
            valueStatus
            isOverridden
            metadata
            channels { id code token }
        }
    }
`);
export const secretSecurityDocument = graphql(`
    query DataHubSecretSecurityApi {
        dataHubSecretSecurity {
            mode
            inlineStorageAvailable
            codeFirstInlineAllowed
        }
    }
`);

export const secretReferencesDocument = graphql(`
    query DataHubSecretReferencesApi($search: String, $skip: Int, $take: Int) {
        dataHubSecretReferences(search: $search, skip: $skip, take: $take) {
            items {
                code
                provider
                source
            }
            totalItems
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

export const assignSecretsToChannelDocument = graphql(`
    mutation AssignDataHubSecretsToChannelApi($input: AssignDataHubSecretsToChannelInput!) {
        assignDataHubSecretsToChannel(input: $input) { id channels { id code token } }
    }
`);

export const removeSecretsFromChannelDocument = graphql(`
    mutation RemoveDataHubSecretsFromChannelApi($input: AssignDataHubSecretsToChannelInput!) {
        removeDataHubSecretsFromChannel(input: $input) { id }
    }
`);

export function useSecrets(options?: DataHubSecretListOptions) {
    return useQuery({
        queryKey: secretKeys.list(options),
        queryFn: () => api.query(secretsListDocument, {
            options: normalizeVendureListOptions(options),
        }).then((res) => res.dataHubSecrets),
    });
}

export function useSecretSecurity() {
    return useQuery({
        queryKey: secretKeys.security(),
        queryFn: () => api.query(secretSecurityDocument).then(
            (res) => res.dataHubSecretSecurity,
        ),
    });
}

export function useInfiniteSecretReferences(
    searchTerm: string,
    enabled = true,
) {
    const options = createCodeReferenceListOptions(searchTerm);
    return useInfiniteQuery({
        queryKey: secretKeys.references(searchTerm.trim()),
        queryFn: ({ pageParam }) => api.query(secretReferencesDocument, {
            search: searchTerm.trim() || undefined,
            skip: pageParam,
            take: options.take,
        }).then(response => response.dataHubSecretReferences),
        initialPageParam: 0,
        getNextPageParam: (_lastPage, pages) => getNextListPageOffset(pages),
        enabled,
    });
}
