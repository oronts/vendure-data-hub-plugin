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
        hasValue: Boolean!
        valueStatus: String!
        isOverridden: Boolean!
        metadata: JSON
        channels: [Channel!]!
    }

    type DataHubSecretSecurity {
        mode: String!
        inlineStorageAvailable: Boolean!
        codeFirstInlineAllowed: Boolean!
    }

    type DataHubSecretList implements PaginatedList {
        items: [DataHubSecret!]!
        totalItems: Int!
    }

    type DataHubSecretReference {
        code: String!
        provider: String!
        source: String!
    }

    type DataHubSecretReferenceList {
        items: [DataHubSecretReference!]!
        totalItems: Int!
    }

    input CreateDataHubSecretInput {
        code: String!
        provider: String = "ENV"
        value: String!
        metadata: JSON
    }

    input UpdateDataHubSecretInput {
        id: ID!
        code: String
        provider: String
        value: String
        metadata: JSON
        clearValue: Boolean! = false
    }

    input AssignDataHubSecretsToChannelInput {
        secretIds: [ID!]!
        channelId: ID!
    }
`;

export const secretQueries = `
    extend type Query {
        dataHubSecrets: DataHubSecretList!
        dataHubSecret(id: ID!): DataHubSecret
        dataHubSecretSecurity: DataHubSecretSecurity!
        dataHubSecretReferences(search: String, skip: Int = 0, take: Int = 25): DataHubSecretReferenceList!
    }
`;

export const secretMutations = `
    extend type Mutation {
        createDataHubSecret(input: CreateDataHubSecretInput!): DataHubSecret!
        updateDataHubSecret(input: UpdateDataHubSecretInput!): DataHubSecret!
        deleteDataHubSecret(id: ID!): DeletionResponse!
        assignDataHubSecretsToChannel(input: AssignDataHubSecretsToChannelInput!): [DataHubSecret!]!
        removeDataHubSecretsFromChannel(input: AssignDataHubSecretsToChannelInput!): [DataHubSecret!]!
    }
`;
