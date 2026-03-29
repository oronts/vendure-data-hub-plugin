export const connectionSchema = `
    type DataHubConnection implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        code: String!
        type: String!
        config: JSON!
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
    }
`;
