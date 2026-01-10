/**
 * File Storage API GraphQL schema definitions
 */
export const storageSchema = `
    """
    File Storage API - Upload and manage files
    """
    type DataHubStoredFile {
        id: String!
        originalName: String!
        mimeType: String!
        size: Int!
        hash: String!
        uploadedAt: DateTime!
        expiresAt: DateTime
        downloadUrl: String!
        previewUrl: String!
    }

    type DataHubStoredFileList {
        items: [DataHubStoredFile!]!
        totalItems: Int!
    }

    type DataHubStorageStats {
        totalFiles: Int!
        totalSize: Int!
        byMimeType: JSON!
    }
`;

export const storageQueries = `
    extend type Query {
        dataHubStorageStats: DataHubStorageStats!
    }
`;
