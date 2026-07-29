import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { useLingui } from '@lingui/react/macro';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createMutationErrorHandler } from './mutation-helpers';
import { createQueryKeys } from '../../utils/query-key-factory';
import type {
    DataHubPipelineListOptions,
} from '../../types';
import { runKeys } from './use-pipeline-runs';
import {
    asVendureListDocument,
    normalizeVendureListOptions,
} from '../../utils/vendure-list-document';
import { PIPELINE_SELECTOR_PAGE_SIZE } from '../../utils/pipeline-list-options';
import { getNextListPageOffset } from '../../utils/paginated-list';

const base = createQueryKeys('pipelines');
export const pipelineKeys = {
    ...base,
    list: (options?: DataHubPipelineListOptions) => [...base.lists(), options] as const,
    infinite: (options?: DataHubPipelineListOptions) => [
        ...base.lists(),
        'infinite',
        options,
    ] as const,
    timeline: (id: string, limit?: number) => [...base.detail(id), 'timeline', limit] as const,
};

export const pipelinesListDocument = asVendureListDocument(graphql(`
    query DataHubPipelinesForList($options: DataHubPipelineListOptions) {
        dataHubPipelines(options: $options) {
            items {
                id
                code
                name
                enabled
                configurationSource
                status
                version
                currentRevisionId
                publishedVersionCount
                requiredCapabilities
                writeCapabilities
                createdAt
                updatedAt
            }
            totalItems
        }
    }
`));

export const pipelineDetailDocument = graphql(`
    query DataHubPipelineDetail($id: ID!) {
        dataHubPipeline(id: $id) {
            id
            createdAt
            updatedAt
            code
            name
            enabled
            configurationSource
            status
            version
            currentRevisionId
            publishedVersionCount
            publishedAt
            requiredCapabilities
            writeCapabilities
            definition
            channels { id code token }
        }
    }
`);

export const createPipelineDocument = graphql(`
    mutation CreateDataHubPipelineApi($input: CreateDataHubPipelineInput!) {
        createDataHubPipeline(input: $input) {
            id
            code
            name
        }
    }
`);

export const updatePipelineDocument = graphql(`
    mutation UpdateDataHubPipelineApi($input: UpdateDataHubPipelineInput!) {
        updateDataHubPipeline(input: $input) {
            id
            code
            name
        }
    }
`);

export const deletePipelineDocument = graphql(`
    mutation DeleteDataHubPipelineApi($id: ID!) {
        deleteDataHubPipeline(id: $id) {
            result
        }
    }
`);

export const assignPipelinesToChannelDocument = graphql(`
    mutation AssignDataHubPipelinesToChannelApi($input: AssignDataHubPipelinesToChannelInput!) {
        assignDataHubPipelinesToChannel(input: $input) { id channels { id code token } }
    }
`);

export const removePipelinesFromChannelDocument = graphql(`
    mutation RemoveDataHubPipelinesFromChannelApi($input: AssignDataHubPipelinesToChannelInput!) {
        removeDataHubPipelinesFromChannel(input: $input) { id }
    }
`);

const runPipelineDocument = graphql(`
    mutation RunDataHubPipelineApi($pipelineId: ID!, $expectedRevisionId: ID) {
        startDataHubPipelineRun(
            pipelineId: $pipelineId
            expectedRevisionId: $expectedRevisionId
        ) {
            id
            status
            revisionId
        }
    }
`);

export interface RunPipelineInput {
    pipelineId: string;
    expectedRevisionId: string | number;
}

export const validatePipelineDefinitionDocument = graphql(`
    query ValidateDataHubPipelineDefinitionApi($definition: JSON!, $level: String) {
        validateDataHubPipelineDefinition(definition: $definition, level: $level) {
            isValid
            issues {
                message
                stepKey
                reason
                field
            }
            warnings {
                message
                stepKey
                reason
                field
            }
            level
        }
    }
`);

const dryRunPipelineDocument = graphql(`
    mutation DryRunDataHubPipelineApi($pipelineId: ID!) {
        startDataHubPipelineDryRun(pipelineId: $pipelineId) {
            metrics
            messages { level code detail stepKey values }
            sampleRecords { step before after }
        }
    }
`);

export const pipelineTimelineDocument = graphql(`
    query DataHubPipelineTimelineApi($pipelineId: ID!, $limit: Int) {
        dataHubPipelineTimeline(pipelineId: $pipelineId, limit: $limit) {
            revision {
                id
                createdAt
                version
                type
                commitMessage
                authorName
                changesSummary
                isLatest
                isCurrent
            }
            runCount
            lastRunAt
            lastRunStatus
        }
    }
`);

const submitPipelineForReviewDocument = graphql(`
    mutation SubmitDataHubPipelineForReviewApi($id: ID!) {
        submitDataHubPipelineForReview(id: $id) {
            id
            status
        }
    }
`);

const approvePipelineDocument = graphql(`
    mutation ApproveDataHubPipelineApi($id: ID!) {
        approveDataHubPipeline(id: $id) {
            id
            status
        }
    }
`);

const rejectPipelineDocument = graphql(`
    mutation RejectDataHubPipelineReviewApi($id: ID!) {
        rejectDataHubPipelineReview(id: $id) {
            id
            status
        }
    }
`);

const publishPipelineDocument = graphql(`
    mutation PublishDataHubPipelineApi($id: ID!) {
        publishDataHubPipeline(id: $id) {
            id
            status
            publishedAt
        }
    }
`);

const archivePipelineDocument = graphql(`
    mutation ArchiveDataHubPipelineApi($id: ID!) {
        archiveDataHubPipeline(id: $id) {
            id
            status
        }
    }
`);

const reactivatePipelineDocument = graphql(`
    mutation ReactivateDataHubPipelineApi($id: ID!) {
        reactivateDataHubPipeline(id: $id) {
            id
            status
            enabled
        }
    }
`);

export function usePipelines(options?: DataHubPipelineListOptions) {
    return useQuery({
        queryKey: pipelineKeys.list(options),
        queryFn: () =>
            api.query(pipelinesListDocument, {
                options: normalizeVendureListOptions(options),
            }).then((res) => res.dataHubPipelines),
    });
}

export function usePipeline(id: string | undefined) {
    const { t } = useLingui();

    return useQuery({
        queryKey: pipelineKeys.detail(id ?? ''),
        queryFn: () => {
            if (!id) {
                throw new Error(t`A pipeline ID is required`);
            }
            return api
                .query(pipelineDetailDocument, { id })
                .then(response => response.dataHubPipeline);
        },
        enabled: Boolean(id),
    });
}

export function useInfinitePipelines(
    options: DataHubPipelineListOptions = {},
    enabled = true,
) {
    const pageSize = options.take ?? PIPELINE_SELECTOR_PAGE_SIZE;
    const baseOptions = { ...options, take: pageSize, skip: undefined };

    return useInfiniteQuery({
        queryKey: pipelineKeys.infinite(baseOptions),
        queryFn: ({ pageParam }) => api
            .query(pipelinesListDocument, {
                options: normalizeVendureListOptions({
                    ...baseOptions,
                    skip: pageParam,
                }),
            })
            .then(response => response.dataHubPipelines),
        initialPageParam: 0,
        getNextPageParam: (_lastPage, pages) => getNextListPageOffset(pages),
        enabled,
    });
}

export function useRunPipeline() {
    const { t } = useLingui();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ pipelineId, expectedRevisionId }: RunPipelineInput) =>
            api.mutate(runPipelineDocument, {
                pipelineId,
                expectedRevisionId,
            }).then((res) => res.startDataHubPipelineRun),
        onSuccess: (_data, { pipelineId }) => {
            queryClient.invalidateQueries({ queryKey: runKeys.lists() });
            queryClient.invalidateQueries({ queryKey: pipelineKeys.detail(pipelineId) });
        },
        onError: createMutationErrorHandler(
            t`Failed to start pipeline`,
            { showDetails: true },
        ),
    });
}

interface ValidatePipelineDefinitionInput {
    definition: Record<string, unknown>;
    level?: string;
}

export function useValidatePipelineDefinition() {
    const { t } = useLingui();

    return useMutation({
        mutationFn: ({ definition, level }: ValidatePipelineDefinitionInput) =>
            api
                .query(validatePipelineDefinitionDocument, { definition, level })
                .then((res) => res.validateDataHubPipelineDefinition),
        onError: createMutationErrorHandler(
            t`Failed to validate pipeline definition`,
            { showDetails: true },
        ),
    });
}

export function useDryRunPipeline(pipelineId: string | undefined) {
    const { t } = useLingui();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => {
            if (!pipelineId) {
                return Promise.reject(new Error(t`A pipeline ID is required`));
            }
            return api
                .mutate(dryRunPipelineDocument, { pipelineId })
                .then((res) => res.startDataHubPipelineDryRun);
        },
        onSuccess: () => {
            if (pipelineId) {
                queryClient.invalidateQueries({ queryKey: pipelineKeys.detail(pipelineId) });
            }
        },
        onError: createMutationErrorHandler(
            t`Dry run failed`,
            { showDetails: true },
        ),
    });
}

function createPipelineStatusHook<TDoc extends Parameters<typeof api.mutate>[0]>(
    document: TDoc,
    resultKey: string,
    getErrorMessage: (t: ReturnType<typeof useLingui>['t']) => string,
) {
    return function usePipelineStatusMutation() {
        const { t } = useLingui();
        const queryClient = useQueryClient();
        return useMutation({
            mutationFn: (id: string) =>
                api.mutate(document, { id }).then((res) => (res as Record<string, unknown>)[resultKey]),
            onSuccess: (data) => {
                queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() });
                if (data && typeof data === 'object' && 'id' in data) {
                    queryClient.invalidateQueries({ queryKey: pipelineKeys.detail(String(data.id)) });
                }
            },
            onError: createMutationErrorHandler(getErrorMessage(t), {
                showDetails: true,
            }),
        });
    };
}

export const useSubmitPipelineForReview = createPipelineStatusHook(
    submitPipelineForReviewDocument,
    'submitDataHubPipelineForReview',
    t => t`Submit failed`,
);
export const useApprovePipeline = createPipelineStatusHook(
    approvePipelineDocument,
    'approveDataHubPipeline',
    t => t`Approve failed`,
);
export const useRejectPipeline = createPipelineStatusHook(
    rejectPipelineDocument,
    'rejectDataHubPipelineReview',
    t => t`Reject failed`,
);
export const usePublishPipeline = createPipelineStatusHook(
    publishPipelineDocument,
    'publishDataHubPipeline',
    t => t`Publish failed`,
);
export const useArchivePipeline = createPipelineStatusHook(
    archivePipelineDocument,
    'archiveDataHubPipeline',
    t => t`Failed to archive pipeline`,
);
export const useReactivatePipeline = createPipelineStatusHook(
    reactivatePipelineDocument,
    'reactivateDataHubPipeline',
    t => t`Failed to reactivate pipeline`,
);
