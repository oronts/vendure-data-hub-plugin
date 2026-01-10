/**
 * Webhook Delivery API GraphQL schema definitions - Retry and DLQ management
 */
export const webhookSchema = `
    """
    Webhook Delivery API - Retry and DLQ management
    """
    enum DataHubWebhookDeliveryStatus {
        PENDING
        DELIVERED
        FAILED
        RETRYING
        DEAD_LETTER
    }

    type DataHubWebhookDelivery {
        id: String!
        webhookId: String!
        url: String!
        method: String!
        headers: JSON!
        payload: JSON!
        status: DataHubWebhookDeliveryStatus!
        attempts: Int!
        maxAttempts: Int!
        lastAttemptAt: DateTime
        nextRetryAt: DateTime
        responseStatus: Int
        responseBody: String
        error: String
        createdAt: DateTime!
        deliveredAt: DateTime
    }

    type DataHubWebhookStats {
        total: Int!
        pending: Int!
        delivered: Int!
        failed: Int!
        retrying: Int!
        deadLetter: Int!
        byWebhook: JSON!
    }

    type DataHubWebhookRetryResult {
        success: Boolean!
        delivery: DataHubWebhookDelivery
    }

    type DataHubDeadLetterResult {
        success: Boolean!
    }
`;

export const webhookQueries = `
    extend type Query {
        dataHubWebhookDeliveries(status: DataHubWebhookDeliveryStatus, webhookId: String, limit: Int): [DataHubWebhookDelivery!]!
        dataHubWebhookDelivery(deliveryId: String!): DataHubWebhookDelivery
        dataHubDeadLetterQueue: [DataHubWebhookDelivery!]!
        dataHubWebhookStats: DataHubWebhookStats!
    }
`;

export const webhookMutations = `
    extend type Mutation {
        dataHubRetryDeadLetter(deliveryId: String!): DataHubWebhookRetryResult!
        dataHubRemoveDeadLetter(deliveryId: String!): DataHubDeadLetterResult!
    }
`;
