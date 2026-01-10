/**
 * Pipeline-related GraphQL schema definitions
 */
export const pipelineSchema = `
    type DataHubPipeline implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        code: String!
        name: String!
        enabled: Boolean!
        version: Int!
        definition: JSON!
        status: String!
        publishedAt: DateTime
        publishedByUserId: String
    }

    type DataHubPipelineList implements PaginatedList {
        items: [DataHubPipeline!]!
        totalItems: Int!
    }

    type DataHubPipelineRun implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        pipeline: DataHubPipeline!
        status: DataHubRunStatus!
        startedAt: DateTime
        finishedAt: DateTime
        metrics: JSON
        error: String
        checkpoint: JSON
        startedByUserId: String
    }

    type DataHubPipelineRevision implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        version: Int!
        authorUserId: String
        definition: JSON!
    }

    type DataHubPipelineRunList implements PaginatedList {
        items: [DataHubPipelineRun!]!
        totalItems: Int!
    }

    type DataHubCheckpoint implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        pipeline: DataHubPipeline!
        data: JSON!
    }

    type DataHubRecordError implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        run: DataHubPipelineRun!
        stepKey: String!
        message: String!
        payload: JSON!
    }

    type DataHubRecordRetryAudit implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        error: DataHubRecordError!
        userId: ID
        previousPayload: JSON!
        patch: JSON!
        resultingPayload: JSON!
    }

    input CreateDataHubPipelineInput {
        code: String!
        name: String!
        enabled: Boolean = true
        version: Int = 1
        definition: JSON!
    }

    input UpdateDataHubPipelineInput {
        id: ID!
        code: String
        name: String
        enabled: Boolean
        version: Int
        definition: JSON
    }

    input DataHubPipelineListOptions {
        skip: Int
        take: Int
        sort: JSON
        filter: JSON
        filterOperator: LogicalOperator
    }

    enum DataHubRunStatus {
        PENDING
        RUNNING
        COMPLETED
        FAILED
        CANCELLED
        CANCEL_REQUESTED
    }

    type DataHubDryRunSampleRecord {
        step: String!
        before: JSON!
        after: JSON!
    }

    type DataHubDryRunResult {
        metrics: JSON!
        notes: [String!]!
        sampleRecords: [DataHubDryRunSampleRecord!]
    }

    type DataHubValidationIssue {
        message: String!
        stepKey: String
        reason: String
        field: String
    }

    type DataHubValidationResult {
        isValid: Boolean!
        errors: [String!]!
        issues: [DataHubValidationIssue!]!
        warnings: [DataHubValidationIssue!]
        level: String
    }

    """
    Result of format conversion operation
    """
    type DataHubFormatConversionResult {
        "The converted definition in the target format"
        definition: JSON!
        "Whether the conversion was successful"
        success: Boolean!
        "Any issues encountered during conversion"
        issues: [String!]!
    }
`;

export const pipelineQueries = `
    extend type Query {
        dataHubPipelines(options: DataHubPipelineListOptions): DataHubPipelineList!
        dataHubPipeline(id: ID!): DataHubPipeline
        dataHubPipelineRuns(pipelineId: ID, options: DataHubPipelineListOptions): DataHubPipelineRunList!
        dataHubPipelineRun(id: ID!): DataHubPipelineRun
        dataHubRunErrors(runId: ID!): [DataHubRecordError!]!
        dataHubRecordRetryAudits(errorId: ID!): [DataHubRecordRetryAudit!]!
        dataHubDeadLetters: [DataHubRecordError!]!
        dataHubPipelineDependencies(id: ID!): [DataHubPipeline!]!
        dataHubPipelineDependents(id: ID!): [DataHubPipeline!]!
        dataHubCheckpoint(pipelineId: ID!): DataHubCheckpoint
        dataHubPipelineRevisions(pipelineId: ID!): [DataHubPipelineRevision!]!
        dataHubPipelineHooks(pipelineId: ID!): JSON!
        "Convert canonical (step-based) definition to visual (nodes/edges) format"
        dataHubToVisualFormat(definition: JSON!): DataHubFormatConversionResult!
        "Convert visual (nodes/edges) definition to canonical (step-based) format"
        dataHubToCanonicalFormat(definition: JSON!): DataHubFormatConversionResult!
    }
`;

export const pipelineMutations = `
    extend type Mutation {
        createDataHubPipeline(input: CreateDataHubPipelineInput!): DataHubPipeline!
        updateDataHubPipeline(input: UpdateDataHubPipelineInput!): DataHubPipeline!
        deleteDataHubPipeline(id: ID!): DeletionResponse!
        publishDataHubPipeline(id: ID!): DataHubPipeline!
        submitDataHubPipelineForReview(id: ID!): DataHubPipeline!
        approveDataHubPipeline(id: ID!): DataHubPipeline!
        rejectDataHubPipelineReview(id: ID!): DataHubPipeline!
        startDataHubPipelineRun(pipelineId: ID!): DataHubPipelineRun!
        cancelDataHubPipelineRun(id: ID!): DataHubPipelineRun!
        startDataHubPipelineDryRun(pipelineId: ID!): DataHubDryRunResult!
        validateDataHubPipelineDefinition(definition: JSON!, level: String): DataHubValidationResult!
        retryDataHubRecord(errorId: ID!, patch: JSON): Boolean!
        setDataHubCheckpoint(pipelineId: ID!, data: JSON!): DataHubCheckpoint!
        markDataHubDeadLetter(id: ID!, deadLetter: Boolean!): Boolean!
        revertDataHubPipelineToRevision(revisionId: ID!): DataHubPipeline!
        runDataHubHookTest(pipelineId: ID!, stage: String!, payload: JSON): Boolean!
    }
`;
