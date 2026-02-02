export const jobSchema = `
    """
    Jobs API - Simplified ETL Configuration
    """
    enum DataHubJobType {
        IMPORT
        EXPORT
        SYNC
    }

    enum DataHubJobStatus {
        DRAFT
        ACTIVE
        PAUSED
        ARCHIVED
    }

    enum DataHubJobRunStatus {
        PENDING
        RUNNING
        COMPLETED
        FAILED
        CANCELLED
        CANCEL_REQUESTED
        PARTIAL
    }

    type DataHubJob implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        code: String!
        name: String!
        description: String
        type: DataHubJobType!
        status: DataHubJobStatus!
        enabled: Boolean!
        definition: JSON!
        runCount: Int!
        lastRunAt: DateTime
        lastRunStatus: DataHubJobRunStatus
        totalRecordsProcessed: Int!
        totalRecordsFailed: Int!
        createdByUserId: String
        publishedAt: DateTime
        publishedByUserId: String
        tags: [String!]
    }

    type DataHubJobList implements PaginatedList {
        items: [DataHubJob!]!
        totalItems: Int!
    }

    type DataHubJobRun implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        job: DataHubJob!
        status: DataHubJobRunStatus!
        startedAt: DateTime
        finishedAt: DateTime
        metrics: JSON
        error: String
        errors: JSON
        checkpoint: JSON
        triggeredBy: String
        startedByUserId: String
        inputFileId: String
        inputFileName: String
        outputFileId: String
        outputFileName: String
        progressPercent: Int!
        progressMessage: String
    }

    type DataHubJobRunList implements PaginatedList {
        items: [DataHubJobRun!]!
        totalItems: Int!
    }

    type DataHubFieldSuggestion {
        source: String!
        target: String!
        confidence: String!
        score: Int!
        reason: String!
        suggestedTransforms: JSON
    }

    type DataHubFilePreview {
        success: Boolean!
        format: String!
        fields: [DataHubPreviewField!]!
        sampleData: JSON!
        totalRows: Int!
        warnings: [String!]!
        suggestedMappings: [DataHubFieldSuggestion!]
    }

    type DataHubPreviewField {
        key: String!
        label: String!
        type: String!
        sampleValues: JSON!
    }

    type DataHubMappingValidation {
        valid: Boolean!
        errors: [String!]!
        warnings: [String!]!
    }

    type DataHubDryRunRecord {
        success: Boolean!
        data: JSON!
        errors: [DataHubDryRunError!]!
    }

    type DataHubDryRunError {
        field: String!
        message: String!
    }

    type DataHubJobDryRunResult {
        valid: Boolean!
        mappedRecords: [DataHubDryRunRecord!]!
        summary: DataHubDryRunSummary!
    }

    type DataHubDryRunSummary {
        total: Int!
        success: Int!
        failed: Int!
    }

    type DataHubVendureEntitySchema {
        entity: String!
        label: String!
        description: String
        fields: [DataHubEntityField!]!
        lookupFields: [String!]!
        importable: Boolean!
        exportable: Boolean!
    }

    type DataHubEntityField {
        key: String!
        type: String!
        required: Boolean!
        readonly: Boolean!
        unique: Boolean!
        indexed: Boolean!
        default: JSON
        description: String
        relation: DataHubRelationInfo
    }

    type DataHubRelationInfo {
        entity: String!
        multiple: Boolean!
    }

    input CreateDataHubJobInput {
        code: String!
        name: String!
        description: String
        type: DataHubJobType = IMPORT
        enabled: Boolean = true
        definition: JSON!
        tags: [String!]
    }

    input UpdateDataHubJobInput {
        id: ID!
        code: String
        name: String
        description: String
        type: DataHubJobType
        status: DataHubJobStatus
        enabled: Boolean
        definition: JSON
        tags: [String!]
    }

    input DataHubJobListOptions {
        skip: Int
        take: Int
        sort: JSON
        filter: JSON
        filterOperator: LogicalOperator
    }

    input DataHubFileUploadInput {
        filename: String!
        content: String!
        format: String
        delimiter: String
        headerRow: Boolean
        sheet: String
    }

    input DataHubSourceFieldInput {
        name: String!
        type: String!
        sampleValues: JSON!
    }
`;

export const jobQueries = `
    extend type Query {
        dataHubJobs(options: DataHubJobListOptions): DataHubJobList!
        dataHubJob(id: ID!): DataHubJob
        dataHubJobByCode(code: String!): DataHubJob
        dataHubJobRuns(jobId: ID, options: DataHubJobListOptions): DataHubJobRunList!
        dataHubJobRun(id: ID!): DataHubJobRun
        dataHubVendureSchemas: [DataHubVendureEntitySchema!]!
        dataHubVendureSchema(entity: String!): DataHubVendureEntitySchema
    }
`;

export const jobMutations = `
    extend type Mutation {
        createDataHubJob(input: CreateDataHubJobInput!): DataHubJob!
        updateDataHubJob(input: UpdateDataHubJobInput!): DataHubJob!
        deleteDataHubJob(id: ID!): DeletionResponse!
        activateDataHubJob(id: ID!): DataHubJob!
        pauseDataHubJob(id: ID!): DataHubJob!
        archiveDataHubJob(id: ID!): DataHubJob!
        duplicateDataHubJob(id: ID!, newCode: String!): DataHubJob!
        startDataHubJobRun(jobId: ID!, inputFileId: String, inputFileName: String): DataHubJobRun!
        cancelDataHubJobRun(id: ID!): DataHubJobRun!
        previewDataHubFile(input: DataHubFileUploadInput!, targetEntity: String): DataHubFilePreview!
        suggestDataHubMappings(sourceFields: [DataHubSourceFieldInput!]!, targetEntity: String!): [DataHubFieldSuggestion!]!
        validateDataHubMappings(mappings: JSON!, targetEntity: String!): DataHubMappingValidation!
        dryRunDataHubJob(jobId: ID!, sampleData: JSON!): DataHubJobDryRunResult!
    }
`;
