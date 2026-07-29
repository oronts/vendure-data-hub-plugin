import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLingui } from '@lingui/react/macro';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createMutationErrorHandler } from './mutation-helpers';
import { createQueryKeys } from '../../utils/query-key-factory';
import { shouldPollRunStatus } from '../../utils/run-status';
import {
    ITEMS_PER_PAGE,
    POLLING_INTERVALS,
} from '../../constants';
import { queueKeys } from './use-queues';
import type { DataHubPipelineRunListOptions } from '../../types';

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
                revisionId
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
            revisionId
            status
            startedAt
            finishedAt
            metrics
            error
            startedByUserId
            gateStepKey
            gateTimeoutAt
            pipeline {
                id
                code
                name
                enabled
                status
                currentRevisionId
                publishedVersionCount
            }
        }
    }
`);

const runErrorsDocument = graphql(`
    query DataHubRunErrorsApi($runId: ID!, $first: Int!, $after: String) {
        dataHubRunErrors(runId: $runId, first: $first, after: $after) {
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
        retryDataHubRecord(errorId: $errorId, patch: $patch) {
            success
            outcome
            message
            errorId
            runId
            stepKey
            adapterCode
            definitionVersion
            appliedPatch
            rejectedPatchKeys
            processed
            succeeded
            failed
            auditId
            auditRecorded
        }
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
    query DataHubRecordRetryAuditsApi($errorId: ID!, $limit: Int!) {
        dataHubRecordRetryAudits(errorId: $errorId, limit: $limit) {
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
        enabled: !!pipelineId,
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
            return shouldPollRunStatus(status)
                ? POLLING_INTERVALS.ACTIVE_RUN : false;
        },
    });
}

export function useRunErrors(runId: string | undefined) {
    return useInfiniteQuery({
        queryKey: runKeys.errors(runId ?? ''),
        queryFn: ({ pageParam }) =>
            api.query(runErrorsDocument, {
                runId: runId!,
                first: ITEMS_PER_PAGE,
                after: pageParam,
            }).then(res => res.dataHubRunErrors),
        initialPageParam: null as string | null,
        getNextPageParam: lastPage => lastPage.hasNextPage ? lastPage.endCursor : undefined,
        enabled: !!runId,
    });
}

export function useErrorAudits(errorId: string | undefined) {
    return useQuery({
        queryKey: runKeys.errorAudits(errorId ?? ''),
        queryFn: () =>
            api.query(errorAuditsDocument, {
                errorId: errorId!,
                limit: ITEMS_PER_PAGE,
            }).then((res) => res.dataHubRecordRetryAudits),
        enabled: !!errorId,
    });
}

export function useCancelRun() {
    const { t } = useLingui();
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
        onError: createMutationErrorHandler(
            t`Failed to cancel pipeline run`,
            { showDetails: true },
        ),
    });
}

export function useRetryError() {
    const { t } = useLingui();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ errorId, patch }: { errorId: string; patch?: Record<string, unknown> }) =>
            api.mutate(retryErrorDocument, { errorId, patch }).then((res) => res.retryDataHubRecord),
        onSuccess: (result) => {
            if (!result.success) {
                return;
            }
            queryClient.invalidateQueries({ queryKey: runKeys.all });
            queryClient.invalidateQueries({ queryKey: queueKeys.all });
        },
        onError: createMutationErrorHandler(
            t`Failed to retry record`,
            { showDetails: true },
        ),
    });
}

export function useApproveGate() {
    const { t } = useLingui();
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
        onError: createMutationErrorHandler(
            t`Failed to approve gate`,
            { showDetails: true },
        ),
    });
}

export function useRejectGate() {
    const { t } = useLingui();
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
        onError: createMutationErrorHandler(
            t`Failed to reject gate`,
            { showDetails: true },
        ),
    });
}
