export const destinationSchema = `
    """
    Export Destinations API - S3, SFTP, HTTP, etc.
    """
    enum DataHubDestinationType {
        DOWNLOAD
        S3
        SFTP
        FTP
        HTTP
        LOCAL
        EMAIL
        GCS
    }

    type DataHubExportDestination {
        id: String!
        name: String!
        type: DataHubDestinationType!
        enabled: Boolean!
        # S3 fields
        bucket: String
        region: String
        prefix: String
        endpoint: String
        # SFTP/FTP fields
        host: String
        port: Int
        username: String
        remotePath: String
        # HTTP fields
        url: String
        method: String
        authType: String
        # Local fields
        directory: String
        # Email fields
        to: [String!]
        subject: String
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
        # S3 fields
        bucket: String
        region: String
        accessKeyId: String
        secretAccessKey: String
        prefix: String
        endpoint: String
        acl: String
        # SFTP/FTP fields
        host: String
        port: Int
        username: String
        password: String
        privateKey: String
        remotePath: String
        secure: Boolean
        # HTTP fields
        url: String
        method: String
        headers: JSON
        authType: String
        authConfig: JSON
        # Local fields
        directory: String
        # Email fields
        to: [String!]
        cc: [String!]
        subject: String
        body: String
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
        dataHubTestExportDestination(id: String!): DataHubDestinationTestResult!
        dataHubDeliverToDestination(destinationId: String!, content: String!, filename: String!, mimeType: String): DataHubDeliveryResult!
    }
`;
