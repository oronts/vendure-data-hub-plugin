export const secretSchema = `
    """
    Secrets API
    """
    type DataHubSecret implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        code: String!
        provider: String!
        value: String
        metadata: JSON
    }

    type DataHubSecretList implements PaginatedList {
        items: [DataHubSecret!]!
        totalItems: Int!
    }

    input DataHubSecretListOptions {
        skip: Int
        take: Int
        sort: JSON
        filter: JSON
        filterOperator: LogicalOperator
    }

    input CreateDataHubSecretInput {
        code: String!
        provider: String = "inline"
        value: String
        metadata: JSON
    }

    input UpdateDataHubSecretInput {
        id: ID!
        code: String
        provider: String
        value: String
        metadata: JSON
    }
`;

export const secretQueries = `
    extend type Query {
        dataHubSecrets(options: DataHubSecretListOptions): DataHubSecretList!
        dataHubSecret(id: ID!): DataHubSecret
    }
`;

export const secretMutations = `
    extend type Mutation {
        createDataHubSecret(input: CreateDataHubSecretInput!): DataHubSecret!
        updateDataHubSecret(input: UpdateDataHubSecretInput!): DataHubSecret!
        deleteDataHubSecret(id: ID!): DeletionResponse!
    }
`;
