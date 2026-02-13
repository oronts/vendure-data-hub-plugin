import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createMutationErrorHandler } from './mutation-helpers';
import { POLLING_INTERVALS } from '../../constants';
import type { JsonObject } from '../../types';

const hookKeys = {
    all: ['pipelineHooks'] as const,
    details: () => [...hookKeys.all, 'detail'] as const,
    detail: (pipelineId: string) => [...hookKeys.details(), pipelineId] as const,
    events: (limit?: number) => [...hookKeys.all, 'events', limit] as const,
};

const hooksDocument = graphql(`
    query DataHubPipelineHooksApi($pipelineId: ID!) {
        dataHubPipelineHooks(pipelineId: $pipelineId)
    }
`);

const hookTestDocument = graphql(`
    mutation RunDataHubHookTestApi($pipelineId: ID!, $stage: String!, $payload: JSON) {
        runDataHubHookTest(pipelineId: $pipelineId, stage: $stage, payload: $payload)
    }
`);

const eventsDocument = graphql(`
    query DataHubEventsApi($limit: Int) {
        dataHubEvents(limit: $limit) {
            name
            createdAt
            payload
        }
    }
`);

export function usePipelineHooks(pipelineId: string | undefined) {
    return useQuery({
        queryKey: hookKeys.detail(pipelineId ?? ''),
        queryFn: () =>
            api.query(hooksDocument, { pipelineId: pipelineId! }).then((res) => res.dataHubPipelineHooks),
        enabled: !!pipelineId,
    });
}

export function useEvents(limit: number = 50) {
    return useQuery({
        queryKey: hookKeys.events(limit),
        queryFn: () => api.query(eventsDocument, { limit }).then((res) => res.dataHubEvents),
        refetchInterval: POLLING_INTERVALS.EVENTS,
    });
}

export function useTestHook() {
    return useMutation({
        mutationFn: ({
            pipelineId,
            stage,
            payload,
        }: {
            pipelineId: string;
            stage: string;
            payload?: JsonObject;
        }) =>
            api.mutate(hookTestDocument, { pipelineId, stage, payload }).then((res) => res.runDataHubHookTest),
        onError: createMutationErrorHandler('test hook'),
    });
}
