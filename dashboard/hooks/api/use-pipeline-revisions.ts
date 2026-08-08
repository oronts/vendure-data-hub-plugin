import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLingui } from '@lingui/react/macro';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createMutationErrorHandler } from './mutation-helpers';
import { pipelineKeys } from './use-pipelines';

export interface AppliedPipelineRevision {
    id: string | number;
    code: string;
    name: string;
    enabled: boolean;
    status: string;
    version: number;
    definition: unknown;
}

export const pipelineRevisionDiffDocument = graphql(`
    query DataHubPipelineRevisionDiffApi($fromRevisionId: ID!, $toRevisionId: ID!) {
        dataHubRevisionDiff(
            fromRevisionId: $fromRevisionId
            toRevisionId: $toRevisionId
        ) {
            fromVersion
            toVersion
            summary
            unchangedCount
            added { path label type before after }
            removed { path label type before after }
            modified { path label type before after }
        }
    }
`);

const restorePipelineDraftDocument = graphql(`
    mutation RestoreDataHubPipelineDraftApi($revisionId: ID!) {
        dataHubRestoreDraft(revisionId: $revisionId) {
            id
            code
            name
            enabled
            status
            version
            definition
        }
    }
`);

const revertPipelineRevisionDocument = graphql(`
    mutation RevertDataHubPipelineRevisionApi($revisionId: ID!) {
        revertDataHubPipelineToRevision(revisionId: $revisionId) {
            id
            code
            name
            enabled
            status
            version
            definition
        }
    }
`);

const pipelineRevisionKeys = {
    diff: (fromRevisionId: string, toRevisionId: string) => [
        ...pipelineKeys.all,
        'revision-diff',
        fromRevisionId,
        toRevisionId,
    ] as const,
};

export function usePipelineRevisionDiff(
    fromRevisionId: string | undefined,
    toRevisionId: string | undefined,
) {
    const { t } = useLingui();

    return useQuery({
        queryKey: pipelineRevisionKeys.diff(fromRevisionId ?? '', toRevisionId ?? ''),
        queryFn: () => {
            if (!fromRevisionId || !toRevisionId) {
                return Promise.reject(new Error(t`Two revision IDs are required`));
            }
            return api.query(pipelineRevisionDiffDocument, {
                fromRevisionId,
                toRevisionId,
            }).then(res => res.dataHubRevisionDiff);
        },
        enabled: Boolean(fromRevisionId && toRevisionId),
    });
}

function useRevisionMutationInvalidation(pipelineId: string | undefined) {
    const queryClient = useQueryClient();
    return async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() }),
            ...(pipelineId
                ? [queryClient.invalidateQueries({ queryKey: pipelineKeys.detail(pipelineId) })]
                : []),
        ]);
    };
}

export function useRestorePipelineDraft(pipelineId: string | undefined) {
    const { t } = useLingui();
    const invalidate = useRevisionMutationInvalidation(pipelineId);
    return useMutation({
        mutationFn: (revisionId: string) => api.mutate(
            restorePipelineDraftDocument,
            { revisionId },
        ).then(res => res.dataHubRestoreDraft),
        onSuccess: invalidate,
        onError: createMutationErrorHandler(
            t`Failed to restore draft`,
            { showDetails: true },
        ),
    });
}

export function useRevertPipelineRevision(pipelineId: string | undefined) {
    const { t } = useLingui();
    const invalidate = useRevisionMutationInvalidation(pipelineId);
    return useMutation({
        mutationFn: (revisionId: string) => api.mutate(
            revertPipelineRevisionDocument,
            { revisionId },
        ).then(res => res.revertDataHubPipelineToRevision),
        onSuccess: invalidate,
        onError: createMutationErrorHandler(
            t`Failed to restore published version`,
            { showDetails: true },
        ),
    });
}
