import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLingui } from '@lingui/react/macro';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createMutationErrorHandler } from './mutation-helpers';
import { createQueryKeys } from '../../utils/query-key-factory';
import {
    ITEMS_PER_PAGE,
    POLLING_INTERVALS,
} from '../../constants';
import { requireSuccessfulQueueMutation } from './queue-mutation-result';

const base = createQueryKeys('queues');
export const queueKeys = {
    ...base,
    stats: () => [...base.all, 'stats'] as const,
    deadLetters: () => [...base.all, 'deadLetters'] as const,
    consumers: () => [...base.all, 'consumers'] as const,
};

const statsDocument = graphql(`
    query DataHubQueueStatsApi {
        dataHubQueueStats {
            pending
            running
            failed
            completedToday
            byPipeline {
                code
                pending
                running
            }
            recentFailed {
                id
                code
                finishedAt
                error
            }
        }
    }
`);

const deadLettersDocument = graphql(`
    query DataHubDeadLettersApi($first: Int!, $after: String) {
        dataHubDeadLetters(first: $first, after: $after) {
            items {
                id
                stepKey
                message
                payload
                stackTrace
            }
            totalItems
            hasNextPage
            endCursor
        }
    }
`);

const consumersDocument = graphql(`
    query DataHubConsumersApi {
        dataHubConsumers {
            pipelineCode
            triggerKey
            queueName
            isActive
            autoStart
            desiredEnabled
            messagesProcessed
            messagesFailed
            lastMessageAt
        }
    }
`);

const startConsumerDocument = graphql(`
    mutation StartDataHubConsumerApi($pipelineCode: String!, $triggerKey: String) {
        startDataHubConsumer(pipelineCode: $pipelineCode, triggerKey: $triggerKey)
    }
`);

const stopConsumerDocument = graphql(`
    mutation StopDataHubConsumerApi($pipelineCode: String!, $triggerKey: String) {
        stopDataHubConsumer(pipelineCode: $pipelineCode, triggerKey: $triggerKey)
    }
`);

const markDeadLetterDocument = graphql(`
    mutation MarkDataHubDeadLetterApi($id: ID!, $deadLetter: Boolean!) {
        markDataHubDeadLetter(id: $id, deadLetter: $deadLetter)
    }
`);

export function useQueueStats() {
    return useQuery({
        queryKey: queueKeys.stats(),
        queryFn: () => api.query(statsDocument).then((res) => res.dataHubQueueStats),
        refetchInterval: POLLING_INTERVALS.QUEUES,
    });
}

export function useDeadLetters(enabled: boolean = true) {
    return useInfiniteQuery({
        queryKey: queueKeys.deadLetters(),
        queryFn: ({ pageParam }) => api.query(deadLettersDocument, {
            first: ITEMS_PER_PAGE,
            after: pageParam,
        }).then(res => res.dataHubDeadLetters),
        initialPageParam: null as string | null,
        getNextPageParam: lastPage => lastPage.hasNextPage ? lastPage.endCursor : undefined,
        enabled,
    });
}

export function useConsumers() {
    return useQuery({
        queryKey: queueKeys.consumers(),
        queryFn: () => api.query(consumersDocument).then((res) => res.dataHubConsumers),
        refetchInterval: POLLING_INTERVALS.CONSUMERS,
    });
}

export function useStartConsumer() {
    const { t } = useLingui();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            pipelineCode,
            triggerKey,
        }: {
            pipelineCode: string;
            triggerKey: string;
        }) => {
            const result = await api.mutate(startConsumerDocument, {
                pipelineCode,
                triggerKey,
            });
            return requireSuccessfulQueueMutation(
                result.startDataHubConsumer,
                t`Failed to start consumer`,
            );
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: queueKeys.consumers() });
        },
        onError: createMutationErrorHandler(
            t`Failed to start consumer`,
            { showDetails: true },
        ),
    });
}

export function useStopConsumer() {
    const { t } = useLingui();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            pipelineCode,
            triggerKey,
        }: {
            pipelineCode: string;
            triggerKey: string;
        }) => {
            const result = await api.mutate(stopConsumerDocument, {
                pipelineCode,
                triggerKey,
            });
            return requireSuccessfulQueueMutation(
                result.stopDataHubConsumer,
                t`Failed to stop consumer`,
            );
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: queueKeys.consumers() });
        },
        onError: createMutationErrorHandler(
            t`Failed to stop consumer`,
            { showDetails: true },
        ),
    });
}

export function useMarkDeadLetter() {
    const { t } = useLingui();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            deadLetter,
        }: {
            id: string;
            deadLetter: boolean;
        }) => {
            const result = await api.mutate(markDeadLetterDocument, {
                id,
                deadLetter,
            });
            return requireSuccessfulQueueMutation(
                result.markDataHubDeadLetter,
                t`Failed to update dead letter`,
            );
        },
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queueKeys.deadLetters() }),
                queryClient.invalidateQueries({ queryKey: queueKeys.stats() }),
            ]);
        },
        onError: createMutationErrorHandler(
            t`Failed to update dead letter`,
            { showDetails: true },
        ),
    });
}
