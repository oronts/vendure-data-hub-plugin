import type { SimpleGraphQLClient } from '@vendure/testing';
import gql from 'graphql-tag';

interface PublishPipelineResult {
    publishDataHubPipeline: {
        id: string;
        status: string;
    };
}

export async function publishPipeline(
    adminClient: SimpleGraphQLClient,
    pipelineId: string,
): Promise<void> {
    const { submitDataHubPipelineForReview } = await adminClient.query<{
        submitDataHubPipelineForReview: {
            id: string;
            status: string;
        };
    }, { id: string }>(gql`
        mutation SubmitPipelineForReview($id: ID!) {
            submitDataHubPipelineForReview(id: $id) {
                id
                status
            }
        }
    `, { id: pipelineId });

    if (
        submitDataHubPipelineForReview.id !== pipelineId
        || submitDataHubPipelineForReview.status !== 'REVIEW'
    ) {
        throw new Error(`Pipeline ${pipelineId} was not submitted for review`);
    }

    const { publishDataHubPipeline } = await adminClient.query<
        PublishPipelineResult,
        { id: string }
    >(gql`
        mutation PublishPipeline($id: ID!) {
            publishDataHubPipeline(id: $id) {
                id
                status
            }
        }
    `, { id: pipelineId });

    if (publishDataHubPipeline.id !== pipelineId || publishDataHubPipeline.status !== 'PUBLISHED') {
        throw new Error(`Pipeline ${pipelineId} was not published`);
    }
}
