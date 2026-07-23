import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createQueryKeys } from '../../utils/query-key-factory';
import {
    asVendureListDocument,
    normalizeVendureListOptions,
} from '../../utils/vendure-list-document';
import { SortOrder } from '../../gql/graphql';
import type { DataHubSchemaListOptions } from '../../gql/graphql';
import { getNextListPageOffset } from '../../utils/paginated-list';
import { REFERENCE_SELECTOR_PAGE_SIZE } from '../../utils/reference-list-options';

const schemaKeys = createQueryKeys('schemas');

export const schemasListDocument = asVendureListDocument(graphql(`
    query DataHubSchemasForList($options: DataHubSchemaListOptions) {
        dataHubSchemas(options: $options) {
            items {
                id
                schemaId
                version
                compatibility
                updatedAt
            }
            totalItems
        }
    }
`));

export const schemaDetailDocument = graphql(`
    query DataHubSchemaDetailApi($id: ID!) {
        dataHubSchema(id: $id) {
            id
            schemaId
            version
            compatibility
            definition
            metadata
            usedBy {
                pipelineId
                pipelineCode
                pipelineName
                pipelineStatus
                stepKey
                stepType
                revisionId
                revisionType
                runId
                runStatus
            }
        }
    }
`);

export const schemaVersionsDocument = graphql(`
    query DataHubSchemaVersionsApi($schemaId: String!) {
        dataHubSchemaVersions(schemaId: $schemaId) {
            id
            createdAt
            schemaId
            version
            compatibility
            definition
        }
    }
`);

export const createSchemaDocument = graphql(`
    mutation CreateDataHubSchemaApi($input: CreateDataHubSchemaInput!) {
        createDataHubSchema(input: $input) {
            id
            schemaId
            version
        }
    }
`);

export const updateSchemaDocument = graphql(`
    mutation UpdateDataHubSchemaApi($input: UpdateDataHubSchemaInput!) {
        updateDataHubSchema(input: $input) {
            id
            metadata
        }
    }
`);

export const deleteSchemaDocument = graphql(`
    mutation DeleteDataHubSchemaApi($id: ID!) {
        deleteDataHubSchema(id: $id) {
            result
            message
        }
    }
`);

export function useSchemas(options?: DataHubSchemaListOptions) {
    return useQuery({
        queryKey: schemaKeys.list(options),
        queryFn: () => api.query(schemasListDocument, {
            options: normalizeVendureListOptions(options),
        }).then(response => response.dataHubSchemas),
    });
}

export function useSchemaVersions(schemaId: string | undefined) {
    return useQuery({
        queryKey: [...schemaKeys.detail(schemaId ?? ''), 'versions'],
        queryFn: () => {
            if (!schemaId) {
                return Promise.reject(new Error('Schema ID is required'));
            }
            return api.query(schemaVersionsDocument, { schemaId })
                .then(response => response.dataHubSchemaVersions);
        },
        enabled: Boolean(schemaId),
    });
}

export function useInfiniteSchemaReferences(searchTerm: string, enabled = true) {
    const normalizedSearch = searchTerm.trim();
    const options: DataHubSchemaListOptions = {
        take: REFERENCE_SELECTOR_PAGE_SIZE,
        skip: 0,
        sort: { schemaId: SortOrder.ASC },
        filter: normalizedSearch
            ? { schemaId: { contains: normalizedSearch } }
            : undefined,
    };
    return useInfiniteQuery({
        queryKey: [...schemaKeys.lists(), 'references', normalizedSearch],
        queryFn: ({ pageParam }) => api.query(schemasListDocument, {
            options: normalizeVendureListOptions({
                ...options,
                skip: pageParam,
            }),
        }).then(response => response.dataHubSchemas),
        initialPageParam: 0,
        getNextPageParam: (_lastPage, pages) => getNextListPageOffset(pages),
        enabled,
    });
}
