import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createMutationErrorHandler } from './mutation-helpers';
import { POLLING_INTERVALS } from '../../constants';

export const queueKeys = {
    all: ['queues'] as const,
    stats: () => [...queueKeys.all, 'stats'] as const,
    deadLetters: () => [...queueKeys.all, 'deadLetters'] as const,
    consumers: () => [...queueKeys.all, 'consumers'] as const,
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
    query DataHubDeadLettersApi {
        dataHubDeadLetters {
            id
            stepKey
            message
            payload
        }
    }
`);

const consumersDocument = graphql(`
    query DataHubConsumersApi {
        dataHubConsumers {
            pipelineCode
            queueName
            isActive
            messagesProcessed
            messagesFailed
            lastMessageAt
        }
    }
`);

const startConsumerDocument = graphql(`
    mutation StartDataHubConsumerApi($pipelineCode: String!) {
        startDataHubConsumer(pipelineCode: $pipelineCode)
    }
`);

const stopConsumerDocument = graphql(`
    mutation StopDataHubConsumerApi($pipelineCode: String!) {
        stopDataHubConsumer(pipelineCode: $pipelineCode)
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

export function useDeadLetters() {
    return useQuery({
        queryKey: queueKeys.deadLetters(),
        queryFn: () => api.query(deadLettersDocument).then((res) => res.dataHubDeadLetters),
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
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ pipelineCode }: { pipelineCode: string }) =>
            api.mutate(startConsumerDocument, { pipelineCode }).then((res) => res.startDataHubConsumer),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queueKeys.consumers() });
        },
        onError: createMutationErrorHandler('start consumer'),
    });
}

export function useStopConsumer() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ pipelineCode }: { pipelineCode: string }) =>
            api.mutate(stopConsumerDocument, { pipelineCode }).then((res) => res.stopDataHubConsumer),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queueKeys.consumers() });
        },
        onError: createMutationErrorHandler('stop consumer'),
    });
}

export function useMarkDeadLetter() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, deadLetter }: { id: string; deadLetter: boolean }) =>
            api.mutate(markDeadLetterDocument, { id, deadLetter }).then((res) => res.markDataHubDeadLetter),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queueKeys.deadLetters() });
            queryClient.invalidateQueries({ queryKey: queueKeys.stats() });
        },
        onError: createMutationErrorHandler('mark dead letter'),
    });
}
