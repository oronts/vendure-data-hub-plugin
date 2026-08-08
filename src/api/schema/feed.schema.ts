export const feedSchema = `
    """
    Feeds API - Export feeds for Google Shopping, Facebook, etc.
    """
    type DataHubFeed implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        code: String!
        name: String!
        format: DataHubFeedFormat!
        channelToken: String
        customGeneratorCode: String
        filters: JSON
        fieldMappings: JSON
        options: JSON
        schedule: DataHubFeedSchedule
        lastGeneratedAt: DateTime
        lastItemCount: Int
        downloadUrl: String
    }

    type DataHubFeedSchedule {
        enabled: Boolean!
        cron: String!
        timezone: String
    }

    enum DataHubFeedFormat {
        GOOGLE_SHOPPING
        META_CATALOG
        CSV
        JSON
        XML
        CUSTOM
    }

    type DataHubFeedFormatInfo {
        code: String!
        label: String!
        description: String!
    }

    type DataHubFeedGenerationResult {
        success: Boolean!
        itemCount: Int!
        generatedAt: DateTime!
        downloadUrl: String
        errors: [String!]!
        warnings: [String!]!
    }

    type DataHubFeedPreview {
        content: String!
        contentType: String!
        itemCount: Int!
    }

    input DataHubFeedInput {
        code: String!
        name: String!
        format: DataHubFeedFormat!
        channelToken: String
        customGeneratorCode: String
        filters: JSON
        fieldMappings: JSON
        options: JSON
        schedule: DataHubFeedScheduleInput
    }

    input DataHubFeedScheduleInput {
        enabled: Boolean!
        cron: String!
        timezone: String
    }
`;

export const feedQueries = `
    extend type Query {
        dataHubFeeds: [DataHubFeed!]!
        dataHubFeed(id: ID!): DataHubFeed
        dataHubFeedFormats: [DataHubFeedFormatInfo!]!
    }
`;

export const feedMutations = `
    extend type Mutation {
        createDataHubFeed(input: DataHubFeedInput!): DataHubFeed!
        updateDataHubFeed(id: ID!, input: DataHubFeedInput!): DataHubFeed!
        deleteDataHubFeed(id: ID!): DeletionResponse!
        generateDataHubFeed(feedCode: String!): DataHubFeedGenerationResult!
        """Generate a complete, valid preview for 1 to 1000 items (default: 10), up to 1 MiB."""
        previewDataHubFeed(feedCode: String!, limit: Int): DataHubFeedPreview!
    }
`;
