/**
 * Real-time Subscriptions GraphQL schema definitions for Pipeline Monitoring
 */
export const subscriptionSchema = `
    """
    Real-time Subscriptions for Pipeline Monitoring
    """
    type DataHubPipelineRunUpdate {
        runId: ID!
        pipelineCode: String!
        status: DataHubRunStatus!
        progressPercent: Int!
        progressMessage: String
        recordsProcessed: Int!
        recordsFailed: Int!
        currentStep: String
        startedAt: DateTime
        finishedAt: DateTime
        error: String
    }

    type DataHubLogEntry {
        id: ID!
        timestamp: DateTime!
        level: DataHubLogLevel!
        message: String!
        pipelineCode: String
        runId: ID
        stepKey: String
        metadata: JSON
    }

    type DataHubWebhookUpdate {
        deliveryId: String!
        webhookId: String!
        status: DataHubWebhookDeliveryStatus!
        attempts: Int!
        lastAttemptAt: DateTime
        responseStatus: Int
        error: String
    }

    type DataHubStepProgress {
        runId: ID!
        stepKey: String!
        status: String!
        recordsIn: Int!
        recordsOut: Int!
        recordsFailed: Int!
        durationMs: Int!
    }

    # Note: Subscriptions require WebSocket setup in Vendure.
    # To enable, configure Apollo Server subscriptions and uncomment below.
    # type Subscription {
    #     """
    #     Subscribe to pipeline run status updates
    #     """
    #     dataHubPipelineRunUpdated(pipelineCode: String): DataHubPipelineRunUpdate!
    #
    #     """
    #     Subscribe to real-time log entries
    #     """
    #     dataHubLogAdded(pipelineCode: String, level: [DataHubLogLevel!]): DataHubLogEntry!
    #
    #     """
    #     Subscribe to webhook delivery updates
    #     """
    #     dataHubWebhookUpdated(webhookId: String): DataHubWebhookUpdate!
    #
    #     """
    #     Subscribe to step-level progress within a run
    #     """
    #     dataHubStepProgress(runId: ID!): DataHubStepProgress!
    # }
`;
