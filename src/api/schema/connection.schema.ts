export const connectionSchema = `
    type DataHubConnection implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        code: String!
        type: String!
        "Persisted ownership source: DATABASE or CODE_FIRST"
        configurationSource: String!
        config: JSON!
        channels: [Channel!]!
    }

    type DataHubConnectionList implements PaginatedList {
        items: [DataHubConnection!]!
        totalItems: Int!
    }

    input CreateDataHubConnectionInput {
        code: String!
        type: String = "http"
        config: JSON
    }

    input UpdateDataHubConnectionInput {
        id: ID!
        code: String
        type: String
        config: JSON
    }

    input AssignDataHubConnectionsToChannelInput {
        connectionIds: [ID!]!
        channelId: ID!
    }

`;

export const connectionQueries = `
    extend type Query {
        dataHubConnections: DataHubConnectionList!
        dataHubConnection(id: ID!): DataHubConnection
    }
`;

export const connectionMutations = `
    extend type Mutation {
        createDataHubConnection(input: CreateDataHubConnectionInput!): DataHubConnection!
        updateDataHubConnection(input: UpdateDataHubConnectionInput!): DataHubConnection!
        deleteDataHubConnection(id: ID!): DeletionResponse!
        assignDataHubConnectionsToChannel(input: AssignDataHubConnectionsToChannelInput!): [DataHubConnection!]!
        removeDataHubConnectionsFromChannel(input: AssignDataHubConnectionsToChannelInput!): [DataHubConnection!]!
    }
`;
