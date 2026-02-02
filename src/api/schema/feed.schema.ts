export const feedSchema = `
    """
    Feeds API - Export feeds for Google Shopping, Facebook, etc.
    """
    type DataHubFeed {
        code: String!
        name: String!
        format: DataHubFeedFormat!
        channelToken: String
        filters: JSON
        fieldMappings: JSON
        options: JSON
        schedule: DataHubFeedSchedule
    }

    type DataHubFeedSchedule {
        enabled: Boolean!
        cron: String!
    }

    enum DataHubFeedFormat {
        GOOGLE_SHOPPING
        META_CATALOG
        AMAZON
        PINTEREST
        TIKTOK
        BING_SHOPPING
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
        filters: JSON
        fieldMappings: JSON
        options: JSON
        schedule: DataHubFeedScheduleInput
    }

    input DataHubFeedScheduleInput {
        enabled: Boolean!
        cron: String!
    }
`;

export const feedQueries = `
    extend type Query {
        dataHubFeeds: [DataHubFeed!]!
        dataHubFeedFormats: [DataHubFeedFormatInfo!]!
    }
`;

export const feedMutations = `
    extend type Mutation {
        createDataHubFeed(input: DataHubFeedInput!): DataHubFeed!
        generateDataHubFeed(feedCode: String!): DataHubFeedGenerationResult!
        previewDataHubFeed(feedCode: String!, limit: Int): DataHubFeedPreview!
    }
`;
