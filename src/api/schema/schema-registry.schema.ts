export const schemaRegistrySchema = `
    enum DataHubSchemaCompatibility {
        STRICT
        BACKWARD
        PERMISSIVE
    }

    type DataHubSchemaUsage {
        pipelineId: ID!
        pipelineCode: String!
        pipelineName: String!
        pipelineStatus: String!
        stepKey: String!
        stepType: String!
        revisionId: ID
        revisionType: String!
        runId: ID
        runStatus: String
    }

    type DataHubSchema implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        schemaId: String!
        version: String!
        compatibility: DataHubSchemaCompatibility!
        definition: JSON!
        metadata: JSON
        usedBy: [DataHubSchemaUsage!]!
        channels: [Channel!]!
    }

    type DataHubSchemaList implements PaginatedList {
        items: [DataHubSchema!]!
        totalItems: Int!
    }

    input CreateDataHubSchemaInput {
        schemaId: String!
        version: String!
        compatibility: DataHubSchemaCompatibility = BACKWARD
        definition: JSON!
        metadata: JSON
    }

    input UpdateDataHubSchemaInput {
        id: ID!
        metadata: JSON
    }

    input AssignDataHubSchemasToChannelInput {
        schemaIds: [ID!]!
        channelId: ID!
    }
`;

export const schemaRegistryQueries = `
    extend type Query {
        dataHubSchemas: DataHubSchemaList!
        dataHubSchema(id: ID!): DataHubSchema
        dataHubSchemaVersions(schemaId: String!): [DataHubSchema!]!
    }
`;

export const schemaRegistryMutations = `
    extend type Mutation {
        createDataHubSchema(input: CreateDataHubSchemaInput!): DataHubSchema!
        updateDataHubSchema(input: UpdateDataHubSchemaInput!): DataHubSchema!
        deleteDataHubSchema(id: ID!): DeletionResponse!
        assignDataHubSchemasToChannel(input: AssignDataHubSchemasToChannelInput!): [DataHubSchema!]!
        removeDataHubSchemasFromChannel(input: AssignDataHubSchemasToChannelInput!): [DataHubSchema!]!
    }
`;
