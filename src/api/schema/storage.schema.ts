export const storageSchema = `
    """
    File Storage API - Upload and manage files
    """
    type DataHubStoredFile implements Node {
        id: ID!
        originalName: String!
        mimeType: String!
        size: Int!
        hash: String!
        uploadedAt: DateTime!
        expiresAt: DateTime
        downloadUrl: String!
        previewUrl: String!
    }

    type DataHubStoredFileList implements PaginatedList {
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
