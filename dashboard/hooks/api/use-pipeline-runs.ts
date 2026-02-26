import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createMutationErrorHandler } from './mutation-helpers';
import { createQueryKeys } from '../../utils/query-key-factory';
import { POLLING_INTERVALS, RUN_STATUS } from '../../constants';
import { queueKeys } from './use-queues';
import type { DataHubPipelineRunListOptions, JsonObject } from '../../types';

const base = createQueryKeys('pipelineRuns');
export const runKeys = {
    ...base,
    list: (pipelineId?: string, options?: DataHubPipelineRunListOptions) =>
        [...base.lists(), pipelineId, options] as const,
    errors: (runId: string) => [...base.all, 'errors', runId] as const,
    errorAudits: (errorId: string) => [...base.all, 'errorAudits', errorId] as const,
};

const runsListDocument = graphql(`
    query DataHubPipelineRunsApi($pipelineId: ID, $options: DataHubPipelineRunListOptions) {
        dataHubPipelineRuns(pipelineId: $pipelineId, options: $options) {
            items {
                id
                status
                startedAt
                finishedAt
                metrics
            }
            totalItems
        }
    }
`);

const runDetailDocument = graphql(`
    query DataHubPipelineRunDetailApi($id: ID!) {
        dataHubPipelineRun(id: $id) {
            id
            status
            startedAt
            finishedAt
            metrics
            error
            startedByUserId
            pipeline {
                id
                code
                name
            }
        }
    }
`);

const runErrorsDocument = graphql(`
    query DataHubRunErrorsApi($runId: ID!) {
        dataHubRunErrors(runId: $runId) {
            id
            stepKey
            message
            payload
            stackTrace
        }
    }
`);

const cancelRunDocument = graphql(`
    mutation CancelDataHubPipelineRunApi($id: ID!) {
        cancelDataHubPipelineRun(id: $id) {
            id
            status
        }
    }
`);

const retryErrorDocument = graphql(`
    mutation RetryDataHubRecordApi($errorId: ID!, $patch: JSON) {
        retryDataHubRecord(errorId: $errorId, patch: $patch)
    }
`);

const approveGateDocument = graphql(`
    mutation ApproveDataHubGateApi($runId: ID!, $stepKey: String!) {
        approveDataHubGate(runId: $runId, stepKey: $stepKey) {
            success
            message
            run {
                id
                status
            }
        }
    }
`);

const rejectGateDocument = graphql(`
    mutation RejectDataHubGateApi($runId: ID!, $stepKey: String!) {
        rejectDataHubGate(runId: $runId, stepKey: $stepKey) {
            success
            message
            run {
                id
                status
            }
        }
    }
`);

const errorAuditsDocument = graphql(`
    query DataHubRecordRetryAuditsApi($errorId: ID!) {
        dataHubRecordRetryAudits(errorId: $errorId) {
            id
            createdAt
            userId
            previousPayload
            patch
            resultingPayload
        }
    }
`);

export function usePipelineRuns(pipelineId?: string, options?: DataHubPipelineRunListOptions) {
    return useQuery({
        queryKey: runKeys.list(pipelineId, options),
        queryFn: () =>
            api
                .query(runsListDocument, { pipelineId, options })
                .then((res) => res.dataHubPipelineRuns),
        refetchInterval: POLLING_INTERVALS.PIPELINE_RUNS,
    });
}

export function usePipelineRun(id: string | undefined) {
    return useQuery({
        queryKey: runKeys.detail(id ?? ''),
        queryFn: () =>
            api.query(runDetailDocument, { id: id! }).then((res) => res.dataHubPipelineRun),
        enabled: !!id,
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            return status === RUN_STATUS.RUNNING || status === RUN_STATUS.PENDING || status === RUN_STATUS.PAUSED
                ? POLLING_INTERVALS.ACTIVE_RUN : false;
        },
    });
}

export function useRunErrors(runId: string | undefined) {
    return useQuery({
        queryKey: runKeys.errors(runId ?? ''),
        queryFn: () =>
            api.query(runErrorsDocument, { runId: runId! }).then((res) => res.dataHubRunErrors),
        enabled: !!runId,
    });
}

export function useErrorAudits(errorId: string | undefined) {
    return useQuery({
        queryKey: runKeys.errorAudits(errorId ?? ''),
        queryFn: () =>
            api.query(errorAuditsDocument, { errorId: errorId! }).then((res) => res.dataHubRecordRetryAudits),
        enabled: !!errorId,
    });
}

export function useCancelRun() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) =>
            api.mutate(cancelRunDocument, { id }).then((res) => res.cancelDataHubPipelineRun),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: runKeys.lists() });
            if (data?.id) {
                queryClient.invalidateQueries({ queryKey: runKeys.detail(String(data.id)) });
            }
        },
        onError: createMutationErrorHandler('cancel pipeline run'),
    });
}

export function useRetryError() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ errorId, patch }: { errorId: string; patch?: JsonObject }) =>
            api.mutate(retryErrorDocument, { errorId, patch }).then((res) => res.retryDataHubRecord),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: runKeys.all });
            queryClient.invalidateQueries({ queryKey: queueKeys.all });
        },
        onError: createMutationErrorHandler('retry record'),
    });
}

export function useApproveGate() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ runId, stepKey }: { runId: string; stepKey: string }) =>
            api.mutate(approveGateDocument, { runId, stepKey }).then((res) => res.approveDataHubGate),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: runKeys.lists() });
            if (data?.run?.id) {
                queryClient.invalidateQueries({ queryKey: runKeys.detail(String(data.run.id)) });
            }
        },
        onError: createMutationErrorHandler('approve gate'),
    });
}

export function useRejectGate() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ runId, stepKey }: { runId: string; stepKey: string }) =>
            api.mutate(rejectGateDocument, { runId, stepKey }).then((res) => res.rejectDataHubGate),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: runKeys.lists() });
            if (data?.run?.id) {
                queryClient.invalidateQueries({ queryKey: runKeys.detail(String(data.run.id)) });
            }
        },
        onError: createMutationErrorHandler('reject gate'),
    });
}
