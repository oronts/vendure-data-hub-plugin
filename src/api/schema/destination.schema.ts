export const destinationSchema = `
    """
    Export destinations resolve credential values from Data Hub Secret Codes only.
    """
    enum DataHubDestinationType {
        S3
        SFTP
        FTP
        HTTP
        LOCAL
        EMAIL
    }

    enum DataHubDestinationAuthType {
        NONE
        BASIC
        BEARER
        API_KEY
    }

    type DataHubDestinationAuth {
        type: DataHubDestinationAuthType!
        secretCode: String
        headerName: String
        username: String
        usernameSecretCode: String
    }

    input DataHubDestinationAuthInput {
        type: DataHubDestinationAuthType!
        secretCode: String
        headerName: String
        username: String
        usernameSecretCode: String
    }

    type DataHubDestinationSmtp {
        host: String!
        port: Int!
        secure: Boolean
        username: String
        usernameSecretCode: String
        passwordSecretCode: String
    }

    input DataHubDestinationSmtpInput {
        host: String!
        port: Int!
        secure: Boolean
        username: String
        usernameSecretCode: String
        passwordSecretCode: String
    }

    type DataHubExportDestination {
        id: String!
        name: String!
        type: DataHubDestinationType!
        enabled: Boolean!
        bucket: String
        region: String
        accessKeyIdSecretCode: String
        secretAccessKeySecretCode: String
        prefix: String
        endpoint: String
        acl: String
        host: String
        port: Int
        username: String
        passwordSecretCode: String
        privateKeySecretCode: String
        passphraseSecretCode: String
        hostKeyFingerprintSecretCode: String
        remotePath: String
        timeout: Int
        secure: Boolean
        url: String
        method: String
        headers: JSON
        headerSecretCodes: JSON
        auth: DataHubDestinationAuth
        directory: String
        to: [String!]
        cc: [String!]
        bcc: [String!]
        from: String
        subject: String
        body: String
        smtp: DataHubDestinationSmtp
    }

    type DataHubDestinationTestResult {
        success: Boolean!
        message: String!
        latencyMs: Int
    }

    type DataHubDeliveryResult {
        success: Boolean!
        destinationId: String!
        destinationType: DataHubDestinationType!
        filename: String!
        size: Int!
        deliveredAt: DateTime
        location: String
        error: String
        metadata: JSON
    }

    type DataHubRegisterDestinationResult {
        success: Boolean!
        id: String!
    }

    input DataHubExportDestinationInput {
        id: String!
        name: String!
        type: DataHubDestinationType!
        enabled: Boolean
        bucket: String
        region: String
        accessKeyIdSecretCode: String
        secretAccessKeySecretCode: String
        prefix: String
        endpoint: String
        acl: String
        host: String
        port: Int
        username: String
        passwordSecretCode: String
        privateKeySecretCode: String
        passphraseSecretCode: String
        hostKeyFingerprintSecretCode: String
        remotePath: String
        timeout: Int
        secure: Boolean
        url: String
        method: String
        headers: JSON
        headerSecretCodes: JSON
        auth: DataHubDestinationAuthInput
        directory: String
        to: [String!]
        cc: [String!]
        bcc: [String!]
        from: String
        subject: String
        body: String
        smtp: DataHubDestinationSmtpInput
    }
`;

export const destinationQueries = `
    extend type Query {
        dataHubExportDestinations: [DataHubExportDestination!]!
        dataHubExportDestination(id: String!): DataHubExportDestination
    }
`;

export const destinationMutations = `
    extend type Mutation {
        dataHubRegisterExportDestination(input: DataHubExportDestinationInput!): DataHubRegisterDestinationResult!
        dataHubDeleteExportDestination(id: String!): DeletionResponse!
        dataHubTestExportDestination(id: String!): DataHubDestinationTestResult!
        dataHubDeliverToDestination(destinationId: String!, content: String!, filename: String!, mimeType: String): DataHubDeliveryResult!
    }
`;
