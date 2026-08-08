export const pipelineSchema = `
    """
    Pipeline lifecycle status for workflow management
    """
    enum DataHubPipelineStatus {
        "Initial state - pipeline is being designed"
        DRAFT
        "Pipeline submitted for review before publishing"
        REVIEW
        "Working copy matches the selected published revision"
        PUBLISHED
        "Pipeline is deactivated but preserved for history"
        ARCHIVED
    }

    input DataHubPipelineCapabilityOperators {
        "Matches a capability code exactly"
        eq: String
        "Excludes a capability code exactly"
        notEq: String
        "Matches when any capability code contains this text"
        contains: String
        "Excludes pipelines with a capability code containing this text"
        notContains: String
        "Matches when any capability code is in this set"
        in: [String!]
        "Excludes pipelines containing any capability code in this set"
        notIn: [String!]
        "Matches when any capability code satisfies this safe regular expression"
        regex: String
        "Matches pipelines with no capabilities when true, or at least one when false"
        isNull: Boolean
    }

    input DataHubPipelineFilterParameter {
        requiredCapabilities: DataHubPipelineCapabilityOperators
        writeCapabilities: DataHubPipelineCapabilityOperators
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
        "Runtime enable switch; an active published revision must also exist"
        enabled: Boolean!
        "Persisted ownership source: DATABASE or CODE_FIRST"
        configurationSource: String!
        "Schema version for definition format"
        version: Int!
        """
        Pipeline definition containing steps, edges, triggers, and context.
        Structure: { version: number, steps: Step[], edges?: Edge[], trigger?: Trigger, context?: Record<string, any> }
        """
        definition: JSON!
        status: DataHubPipelineStatus!
        "Selected published revision; executable only while the pipeline is runnable"
        currentRevisionId: ID
        "Number of the selected published version; zero before first publication"
        publishedVersionCount: Int!
        "When the pipeline was last published"
        publishedAt: DateTime
        "User ID who published the pipeline"
        publishedByUserId: String
        "Effective permissions declared by the pipeline and its registered adapters"
        requiredCapabilities: [String!]!
        "Declared data domains this pipeline writes"
        writeCapabilities: [String!]!
        channels: [Channel!]!
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
        "Immutable published revision executed by this run"
        revisionId: ID
        status: DataHubRunStatus!
        startedAt: DateTime
        finishedAt: DateTime
        """
        Execution metrics: { recordsProcessed, recordsFailed, stepMetrics, duration, etc. }
        """
        metrics: JSON
        "Error message if run failed"
        error: String
        "Alias for error — error message if the run failed"
        errorMessage: String
        """
        Per-run seeded graph input when the run was started with seed records; null for ordinary runs.
        Durable adapter checkpoints are stored separately as DataHubCheckpoint records.
        """
        checkpoint: JSON
        "User ID who started the run (null for automated triggers)"
        startedByUserId: String
        "Trigger source identifier (e.g., 'manual', 'webhook:key', 'schedule:key', 'event:key')"
        triggeredBy: String
        "Alias for finishedAt — when the run reached a terminal state"
        completedAt: DateTime
        "Exact GATE step awaiting action while the run is PAUSED"
        gateStepKey: String
        "Durable auto-approval deadline for a paused TIMEOUT gate"
        gateTimeoutAt: DateTime
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
        "JavaScript stack trace for debugging (only present when the error originated from an exception)"
        stackTrace: String
    }

    type DataHubRecordErrorPage {
        items: [DataHubRecordError!]!
        totalItems: Int!
        hasNextPage: Boolean!
        endCursor: String
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
        "Accepted field patch applied to the retried payload"
        patch: JSON!
        "Record state after applying the patch"
        resultingPayload: JSON!
    }
    enum DataHubRecordRetryOutcome {
        APPLIED
        RECORD_NOT_FOUND
        RUN_NOT_FOUND
        PIPELINE_NOT_FOUND
        STEP_NOT_FOUND
        PATCH_REJECTED
        REPLAY_FAILED
    }

    """
    Structured result of retrying one quarantined record.
    """
    type DataHubRecordRetryResult {
        success: Boolean!
        outcome: DataHubRecordRetryOutcome!
        message: String!
        errorId: ID!
        runId: ID
        stepKey: String
        adapterCode: String
        definitionVersion: Int
        "The accepted field patch. Empty when validation rejects the request before replay."
        appliedPatch: JSON!
        "Requested field names rejected by the loader patch policy."
        rejectedPatchKeys: [String!]!
        processed: Int!
        succeeded: Int!
        failed: Int!
        auditId: ID
        auditRecorded: Boolean!
    }

    """
    Input for creating a new pipeline
    """
    input CreateDataHubPipelineInput {
        "Unique identifier for webhook/API access (lowercase alphanumeric with hyphens)"
        code: String!
        "Human-readable pipeline name"
        name: String!
        "Runtime enable switch (default: true); the pipeline must also be PUBLISHED to run"
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

    input AssignDataHubPipelinesToChannelInput {
        pipelineIds: [ID!]!
        channelId: ID!
    }

    """
    Pipeline run execution status
    """
    enum DataHubRunStatus {
        "Run created but not yet started"
        PENDING
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

    enum DataHubDryRunMessageLevel {
        INFO
        WARNING
        ERROR
    }

    type DataHubDryRunMessage {
        "Machine-readable severity"
        level: DataHubDryRunMessageLevel!
        "Stable code for client-side localization and handling"
        code: String!
        "Raw runtime detail when the message originates from an adapter or record"
        detail: String
        "Step that produced the message, when applicable"
        stepKey: String
        "Structured interpolation values for the message code"
        values: JSON
    }

    """
    Result of a dry run execution
    """
    type DataHubDryRunResult {
        "Execution metrics: { recordsProcessed, duration, stepMetrics }"
        metrics: JSON!
        "Structured informational, warning, and error messages"
        messages: [DataHubDryRunMessage!]!
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
        "Detailed validation issues"
        issues: [DataHubValidationIssue!]!
        "Non-blocking warnings"
        warnings: [DataHubValidationIssue!]
        "Validation level used: SYNTAX | SEMANTIC | FULL"
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

    enum DataHubHookExecutionStatus {
        EXECUTED
        PARTIAL
        FAILED
        SKIPPED
    }

    type DataHubHookExecutionFailure {
        action: String!
        type: String!
        error: String!
    }

    type DataHubHookExecutionResult {
        status: DataHubHookExecutionStatus!
        configured: Int!
        executed: Int!
        skipped: Int!
        failed: Int!
        errors: [DataHubHookExecutionFailure!]!
    }
`;

export const pipelineQueries = `
    extend type Query {
        dataHubPipelines: DataHubPipelineList!
        dataHubPipeline(id: ID!): DataHubPipeline
        dataHubPipelineRuns(pipelineId: ID): DataHubPipelineRunList!
        dataHubPipelineRun(id: ID!): DataHubPipelineRun
        dataHubRunErrors(runId: ID!, first: Int = 20, after: String): DataHubRecordErrorPage!
        dataHubRecordRetryAudits(errorId: ID!, limit: Int = 20): [DataHubRecordRetryAudit!]!
        dataHubDeadLetters(first: Int = 20, after: String): DataHubRecordErrorPage!
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
        reactivateDataHubPipeline(id: ID!): DataHubPipeline!
        startDataHubPipelineRun(pipelineId: ID!, expectedRevisionId: ID): DataHubPipelineRun!
        cancelDataHubPipelineRun(id: ID!): DataHubPipelineRun!
        startDataHubPipelineDryRun(pipelineId: ID!): DataHubDryRunResult!
        retryDataHubRecord(errorId: ID!, patch: JSON): DataHubRecordRetryResult!
        updateDataHubCheckpoint(pipelineId: ID!, data: JSON!): DataHubCheckpoint!
        markDataHubDeadLetter(id: ID!, deadLetter: Boolean!): Boolean!
        revertDataHubPipelineToRevision(revisionId: ID!): DataHubPipeline!
        runDataHubHookTest(pipelineId: ID!, stage: String!, payload: JSON): DataHubHookExecutionResult!
        assignDataHubPipelinesToChannel(input: AssignDataHubPipelinesToChannelInput!): [DataHubPipeline!]!
        removeDataHubPipelinesFromChannel(input: AssignDataHubPipelinesToChannelInput!): [DataHubPipeline!]!
    }
`;
