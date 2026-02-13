import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { ArchiveDataHubPipelineApiDocument } from '../../gql/graphql';
import { createMutationErrorHandler } from './mutation-helpers';
import type {
    DataHubPipelineListOptions,
} from '../../types';
import { runKeys } from './usePipelineRuns';

export const pipelineKeys = {
    all: ['pipelines'] as const,
    lists: () => [...pipelineKeys.all, 'list'] as const,
    list: (options?: DataHubPipelineListOptions) => [...pipelineKeys.lists(), options] as const,
    details: () => [...pipelineKeys.all, 'detail'] as const,
    detail: (id: string) => [...pipelineKeys.details(), id] as const,
    timeline: (id: string, limit?: number) => [...pipelineKeys.detail(id), 'timeline', limit] as const,
};

export const pipelinesListDocument = graphql(`
    query DataHubPipelinesForList($options: DataHubPipelineListOptions) {
        dataHubPipelines(options: $options) {
            items {
                id
                code
                name
                enabled
                status
                updatedAt
            }
            totalItems
        }
    }
`);

export const pipelineDetailDocument = graphql(`
    query DataHubPipelineDetail($id: ID!) {
        dataHubPipeline(id: $id) {
            id
            createdAt
            updatedAt
            code
            name
            enabled
            status
            version
            publishedAt
            definition
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

const runPipelineDocument = graphql(`
    mutation RunDataHubPipelineApi($pipelineId: ID!) {
        startDataHubPipelineRun(pipelineId: $pipelineId) {
            id
            status
        }
    }
`);

export const validatePipelineDefinitionDocument = graphql(`
    mutation ValidateDataHubPipelineDefinitionApi($definition: JSON!, $level: String) {
        validateDataHubPipelineDefinition(definition: $definition, level: $level) {
            isValid
            errors
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
            notes
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

const archivePipelineDocument = ArchiveDataHubPipelineApiDocument;

export function usePipelines(options?: DataHubPipelineListOptions) {
    return useQuery({
        queryKey: pipelineKeys.list(options),
        queryFn: () =>
            api.query(pipelinesListDocument, { options }).then((res) => res.dataHubPipelines),
    });
}

export function usePipeline(id: string | undefined) {
    return useQuery({
        queryKey: pipelineKeys.detail(id ?? ''),
        queryFn: () =>
            api.query(pipelineDetailDocument, { id: id! }).then((res) => res.dataHubPipeline),
        enabled: !!id,
    });
}

export function useRunPipeline() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (pipelineId: string) =>
            api.mutate(runPipelineDocument, { pipelineId }).then((res) => res.startDataHubPipelineRun),
        onSuccess: (_data, pipelineId) => {
            queryClient.invalidateQueries({ queryKey: runKeys.lists() });
            queryClient.invalidateQueries({ queryKey: pipelineKeys.detail(pipelineId) });
        },
        onError: createMutationErrorHandler('run pipeline'),
    });
}

export interface ValidatePipelineDefinitionInput {
    definition: Record<string, unknown>;
    level?: string;
}

export function useValidatePipelineDefinition() {
    return useMutation({
        mutationFn: ({ definition, level }: ValidatePipelineDefinitionInput) =>
            api
                .mutate(validatePipelineDefinitionDocument, { definition, level })
                .then((res) => res.validateDataHubPipelineDefinition),
        onError: createMutationErrorHandler('validate pipeline definition'),
    });
}

export function useDryRunPipeline(pipelineId: string | undefined) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => {
            if (!pipelineId) {
                return Promise.reject(new Error('Pipeline ID is required'));
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
        onError: createMutationErrorHandler('dry run pipeline'),
    });
}

function createPipelineStatusHook<TDoc extends Parameters<typeof api.mutate>[0]>(
    document: TDoc,
    resultKey: string,
    actionName: string,
) {
    return function usePipelineStatusMutation() {
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
            onError: createMutationErrorHandler(actionName),
        });
    };
}

export const useSubmitPipelineForReview = createPipelineStatusHook(
    submitPipelineForReviewDocument, 'submitDataHubPipelineForReview', 'submit pipeline for review',
);
export const useApprovePipeline = createPipelineStatusHook(
    approvePipelineDocument, 'approveDataHubPipeline', 'approve pipeline',
);
export const useRejectPipeline = createPipelineStatusHook(
    rejectPipelineDocument, 'rejectDataHubPipelineReview', 'reject pipeline',
);
export const usePublishPipeline = createPipelineStatusHook(
    publishPipelineDocument, 'publishDataHubPipeline', 'publish pipeline',
);
export const useArchivePipeline = createPipelineStatusHook(
    archivePipelineDocument, 'archiveDataHubPipeline', 'archive pipeline',
);
