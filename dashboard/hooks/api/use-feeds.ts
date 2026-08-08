import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLingui } from '@lingui/react/macro';
import { api } from '@vendure/dashboard';
import type { DataHubFeedInput } from '../../gql/graphql';
import { graphql } from '../../gql';
import { createQueryKeys } from '../../utils/query-key-factory';

const base = createQueryKeys('feeds');

export const feedKeys = {
    ...base,
    formats: () => [...base.all, 'formats'] as const,
};

export const feedsListDocument = graphql(`
    query DataHubFeedsApi {
        dataHubFeeds {
            id
            createdAt
            updatedAt
            code
            name
            format
            schedule {
                enabled
                cron
                timezone
            }
            lastGeneratedAt
            lastItemCount
            downloadUrl
        }
    }
`);

export const feedDetailDocument = graphql(`
    query DataHubFeedDetailApi($id: ID!) {
        dataHubFeed(id: $id) {
            id
            createdAt
            updatedAt
            code
            name
            format
            channelToken
            customGeneratorCode
            filters
            fieldMappings
            options
            schedule {
                enabled
                cron
                timezone
            }
            lastGeneratedAt
            lastItemCount
            downloadUrl
        }
    }
`);

export const feedFormatsDocument = graphql(`
    query DataHubFeedFormatsApi {
        dataHubFeedFormats {
            code
            label
            description
        }
    }
`);

export const createFeedDocument = graphql(`
    mutation CreateDataHubFeedApi($input: DataHubFeedInput!) {
        createDataHubFeed(input: $input) {
            id
            code
            name
        }
    }
`);

export const updateFeedDocument = graphql(`
    mutation UpdateDataHubFeedApi($id: ID!, $input: DataHubFeedInput!) {
        updateDataHubFeed(id: $id, input: $input) {
            id
            code
            name
            updatedAt
            downloadUrl
        }
    }
`);

export const deleteFeedDocument = graphql(`
    mutation DeleteDataHubFeedApi($id: ID!) {
        deleteDataHubFeed(id: $id) {
            result
            message
        }
    }
`);

export const generateFeedDocument = graphql(`
    mutation GenerateDataHubFeedApi($feedCode: String!) {
        generateDataHubFeed(feedCode: $feedCode) {
            success
            itemCount
            generatedAt
            downloadUrl
            errors
            warnings
        }
    }
`);

export const previewFeedDocument = graphql(`
    mutation PreviewDataHubFeedApi($feedCode: String!, $limit: Int) {
        previewDataHubFeed(feedCode: $feedCode, limit: $limit) {
            content
            contentType
            itemCount
        }
    }
`);

export function useFeeds() {
    return useQuery({
        queryKey: feedKeys.lists(),
        queryFn: () => api.query(feedsListDocument).then(response => response.dataHubFeeds),
    });
}

export function useFeed(id: string | undefined) {
    const { t } = useLingui();
    return useQuery({
        queryKey: feedKeys.detail(id ?? ''),
        queryFn: () => {
            if (!id) throw new Error(t`A feed ID is required`);
            return api.query(feedDetailDocument, { id }).then(response => response.dataHubFeed);
        },
        enabled: Boolean(id),
    });
}

export function useFeedFormats() {
    return useQuery({
        queryKey: feedKeys.formats(),
        queryFn: () => api.query(feedFormatsDocument).then(response => response.dataHubFeedFormats),
        staleTime: Infinity,
    });
}

export function useCreateFeed() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: DataHubFeedInput) => (
            api.mutate(createFeedDocument, { input }).then(response => response.createDataHubFeed)
        ),
        onSuccess: async feed => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: feedKeys.lists() }),
                queryClient.invalidateQueries({ queryKey: feedKeys.detail(String(feed.id)) }),
            ]);
        },
    });
}

export function useUpdateFeed() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: DataHubFeedInput }) => (
            api.mutate(updateFeedDocument, { id, input }).then(response => response.updateDataHubFeed)
        ),
        onSuccess: async feed => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: feedKeys.lists() }),
                queryClient.invalidateQueries({ queryKey: feedKeys.detail(String(feed.id)) }),
            ]);
        },
    });
}

export function useDeleteFeed() {
    const { t } = useLingui();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const response = await api.mutate(deleteFeedDocument, { id });
            const result = response.deleteDataHubFeed;
            if (result.result !== 'DELETED') {
                throw new Error(
                    result.message ?? t`The feed could not be deleted`,
                );
            }
            return result;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: feedKeys.all });
        },
    });
}

export function useGenerateFeed() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (feedCode: string) => (
            api.mutate(generateFeedDocument, { feedCode }).then(response => response.generateDataHubFeed)
        ),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: feedKeys.all });
        },
    });
}

export function usePreviewFeed() {
    return useMutation({
        mutationFn: ({ feedCode, limit }: { feedCode: string; limit?: number }) => (
            api.mutate(previewFeedDocument, { feedCode, limit }).then(response => response.previewDataHubFeed)
        ),
    });
}
