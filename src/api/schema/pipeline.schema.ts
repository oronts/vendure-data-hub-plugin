export const pipelineSchema = `
    """
    Pipeline lifecycle status for workflow management
    """
    enum DataHubPipelineStatus {
        "Initial state - pipeline is being designed"
        DRAFT
        "Pipeline submitted for review before publishing"
        REVIEW
        "Pipeline is live and can be triggered"
        PUBLISHED
        "Pipeline is deactivated but preserved for history"
        ARCHIVED
    }

    """
    A data pipeline configuration defining steps, triggers, and execution flow
    """
    type DataHubPipeline implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        "Unique identifier for webhook/API access"
        code: String!
        "Human-readable pipeline name"
        name: String!
        "Whether the pipeline can be triggered"
        enabled: Boolean!
        "Schema version for definition format"
        version: Int!
        """
        Pipeline definition containing steps, edges, triggers, and context.
        Structure: { version: number, steps: Step[], edges?: Edge[], trigger?: Trigger, context?: Record<string, any> }
        """
        definition: JSON!
        status: DataHubPipelineStatus!
        "When the pipeline was last published"
        publishedAt: DateTime
        "User ID who published the pipeline"
        publishedByUserId: String
    }

    type DataHubPipelineList implements PaginatedList {
        items: [DataHubPipeline!]!
        totalItems: Int!
    }

    """
    A single execution instance of a pipeline
    """
    type DataHubPipelineRun implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        pipeline: DataHubPipeline!
        status: DataHubRunStatus!
        startedAt: DateTime
        finishedAt: DateTime
        """
        Execution metrics: { recordsProcessed, recordsFailed, stepMetrics, duration, etc. }
        """
        metrics: JSON
        "Error message if run failed"
        error: String
        """
        Checkpoint data for resumable pipelines: { lastProcessedId, cursor, state }
        """
        checkpoint: JSON
        "User ID who started the run (null for automated triggers)"
        startedByUserId: String
        "Trigger source identifier (e.g., 'manual', 'webhook:key', 'schedule:key', 'event:key')"
        triggeredBy: String
    }

    """
    Historical snapshot of a pipeline definition for version control
    """
    type DataHubPipelineRevision implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        "Revision version number"
        version: Int!
        "User ID who created this revision"
        authorUserId: String
        "Complete pipeline definition at this revision"
        definition: JSON!
    }

    type DataHubPipelineRunList implements PaginatedList {
        items: [DataHubPipelineRun!]!
        totalItems: Int!
    }

    """
    Persistent checkpoint for resumable pipeline execution
    """
    type DataHubCheckpoint implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        pipeline: DataHubPipeline!
        """
        Checkpoint state data: { cursor, lastId, processedCount, customState }
        """
        data: JSON!
    }

    """
    A record that failed processing during pipeline execution
    """
    type DataHubRecordError implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        run: DataHubPipelineRun!
        "The step key where the error occurred"
        stepKey: String!
        "Error message description"
        message: String!
        "The record data that failed to process"
        payload: JSON!
    }

    """
    Audit trail for retry attempts on failed records
    """
    type DataHubRecordRetryAudit implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        error: DataHubRecordError!
        "User ID who performed the retry"
        userId: ID
        "Record state before the retry patch"
        previousPayload: JSON!
        "JSON Patch operations applied"
        patch: JSON!
        "Record state after applying the patch"
        resultingPayload: JSON!
    }

    """
    Input for creating a new pipeline
    """
    input CreateDataHubPipelineInput {
        "Unique identifier for webhook/API access (lowercase alphanumeric with hyphens)"
        code: String!
        "Human-readable pipeline name"
        name: String!
        "Whether the pipeline can be triggered (default: true)"
        enabled: Boolean = true
        "Schema version for definition format (default: 1)"
        version: Int = 1
        """
        Pipeline definition: { version: number, steps: Step[], edges?: Edge[], trigger?: Trigger }
        """
        definition: JSON!
    }

    """
    Input for updating an existing pipeline
    """
    input UpdateDataHubPipelineInput {
        "Pipeline ID to update"
        id: ID!
        "New unique code (optional)"
        code: String
        "New display name (optional)"
        name: String
        "Enable/disable pipeline (optional)"
        enabled: Boolean
        "Schema version (optional)"
        version: Int
        "Updated pipeline definition (optional)"
        definition: JSON
    }

    """
    Pagination and filtering options for pipeline lists
    """
    input DataHubPipelineListOptions {
        "Number of items to skip"
        skip: Int
        "Number of items to return"
        take: Int
        "Sort configuration: { field: 'asc' | 'desc' }"
        sort: JSON
        "Filter configuration for field-based filtering"
        filter: JSON
        "Logical operator for combining filters"
        filterOperator: LogicalOperator
    }

    """
    Pipeline run execution status
    """
    enum DataHubRunStatus {
        "Run created but not yet started"
        PENDING
        "Run queued for execution"
        QUEUED
        "Run currently executing"
        RUNNING
        "Run paused (resumable)"
        PAUSED
        "Run finished successfully"
        COMPLETED
        "Run failed with error"
        FAILED
        "Run exceeded time limit"
        TIMEOUT
        "Run was cancelled"
        CANCELLED
        "Cancellation requested, awaiting confirmation"
        CANCEL_REQUESTED
    }

    """
    Sample record transformation for dry run preview
    """
    type DataHubDryRunSampleRecord {
        "Step key where transformation occurred"
        step: String!
        "Record state before this step"
        before: JSON!
        "Record state after this step"
        after: JSON!
    }

    """
    Result of a dry run execution
    """
    type DataHubDryRunResult {
        "Execution metrics: { recordsProcessed, duration, stepMetrics }"
        metrics: JSON!
        "Informational notes about the dry run"
        notes: [String!]!
        "Sample records showing transformation at each step"
        sampleRecords: [DataHubDryRunSampleRecord!]
    }

    """
    A validation issue found in pipeline definition
    """
    type DataHubValidationIssue {
        "Human-readable issue description"
        message: String!
        "Step key where issue was found (if applicable)"
        stepKey: String
        "Technical reason code for the issue"
        reason: String
        "Specific field that caused the issue"
        field: String
    }

    """
    Result of pipeline definition validation
    """
    type DataHubValidationResult {
        "Whether the definition passed validation"
        isValid: Boolean!
        "List of error messages (deprecated, use issues)"
        errors: [String!]!
        "Detailed validation issues"
        issues: [DataHubValidationIssue!]!
        "Non-blocking warnings"
        warnings: [DataHubValidationIssue!]
        "Validation level used: 'strict' | 'normal' | 'lenient'"
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
        validateDataHubPipelineDefinition(definition: JSON!, level: String): DataHubValidationResult!
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
        archiveDataHubPipeline(id: ID!): DataHubPipeline!
        startDataHubPipelineRun(pipelineId: ID!): DataHubPipelineRun!
        cancelDataHubPipelineRun(id: ID!): DataHubPipelineRun!
        startDataHubPipelineDryRun(pipelineId: ID!): DataHubDryRunResult!
        retryDataHubRecord(errorId: ID!, patch: JSON): Boolean!
        updateDataHubCheckpoint(pipelineId: ID!, data: JSON!): DataHubCheckpoint!
        markDataHubDeadLetter(id: ID!, deadLetter: Boolean!): Boolean!
        revertDataHubPipelineToRevision(revisionId: ID!): DataHubPipeline!
        runDataHubHookTest(pipelineId: ID!, stage: String!, payload: JSON): Boolean!
    }
`;
