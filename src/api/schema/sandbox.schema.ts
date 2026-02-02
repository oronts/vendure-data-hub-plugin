export const sandboxSchema = `
    # ============================================
    # SANDBOX EXECUTION TYPES
    # ============================================

    """
    Overall status of sandbox execution
    """
    enum DataHubSandboxStatus {
        SUCCESS
        WARNING
        ERROR
    }

    """
    Outcome of a record transformation in sandbox
    """
    enum DataHubSandboxRecordOutcome {
        SUCCESS
        FILTERED
        ERROR
        UNCHANGED
    }

    """
    Type of field change detected in sandbox diff
    """
    enum DataHubSandboxFieldChangeType {
        ADDED
        REMOVED
        MODIFIED
        UNCHANGED
        TYPE_CHANGED
    }

    """
    Severity of validation issues in sandbox
    """
    enum DataHubSandboxValidationSeverity {
        ERROR
        WARNING
    }

    """
    Status of a step execution in sandbox
    """
    enum DataHubSandboxStepStatus {
        SUCCESS
        WARNING
        ERROR
        SKIPPED
    }

    # ============================================
    # FIELD DIFF TYPES
    # ============================================

    """
    Field-level diff showing exactly what changed
    """
    type DataHubSandboxFieldDiff {
        "Field name/path"
        field: String!
        "Type of change"
        changeType: DataHubSandboxFieldChangeType!
        "Value before the change"
        beforeValue: JSON
        "Value after the change"
        afterValue: JSON
        "Data type before"
        beforeType: String!
        "Data type after"
        afterType: String!
    }

    """
    Aggregated field change across all records
    """
    type DataHubSandboxAggregatedFieldChange {
        "Field name"
        field: String!
        "Type of change"
        changeType: DataHubSandboxFieldChangeType!
        "Number of records affected"
        affectedCount: Int!
        "Total records analyzed"
        totalRecords: Int!
        "Percentage of records affected"
        percentage: Int!
        "Sample values before change"
        sampleBefore: [JSON!]!
        "Sample values after change"
        sampleAfter: [JSON!]!
    }

    # ============================================
    # RECORD SAMPLE TYPES
    # ============================================

    """
    Sample record showing before/after state with diffs
    """
    type DataHubSandboxRecordSample {
        "Index of this record in the batch"
        recordIndex: Int!
        "Extracted record ID if available"
        recordId: String
        "Record state before processing"
        before: JSON!
        "Record state after processing"
        after: JSON!
        "Outcome of processing this record"
        outcome: DataHubSandboxRecordOutcome!
        "Error message if outcome is error"
        errorMessage: String
        "Field-level diffs for this record"
        fieldDiffs: [DataHubSandboxFieldDiff!]!
    }

    """
    Validation issue found during sandbox processing
    """
    type DataHubSandboxValidationIssue {
        "Record index"
        recordIndex: Int!
        "Record ID if available"
        recordId: String
        "Field with the issue"
        field: String!
        "Validation rule that failed"
        rule: String!
        "Human-readable error message"
        message: String!
        "Severity of the issue"
        severity: DataHubSandboxValidationSeverity!
        "The problematic value"
        value: JSON
    }

    # ============================================
    # STEP EXECUTION TYPES
    # ============================================

    """
    Detailed result of executing a single step
    """
    type DataHubSandboxStepResult {
        "Step identifier"
        stepKey: String!
        "Step type (extract, transform, load, etc.)"
        stepType: String!
        "Human-readable step name"
        stepName: String!
        "Execution status"
        status: DataHubSandboxStepStatus!
        "Number of records entering this step"
        recordsIn: Int!
        "Number of records exiting this step"
        recordsOut: Int!
        "Number of records filtered out"
        recordsFiltered: Int!
        "Number of records that errored"
        recordsErrored: Int!
        "Execution time in milliseconds"
        durationMs: Int!
        "Error message if status is error"
        errorMessage: String
        "Warnings generated during execution"
        warnings: [String!]!
        "Sample records with before/after state"
        samples: [DataHubSandboxRecordSample!]!
        "Aggregated field changes"
        fieldChanges: [DataHubSandboxAggregatedFieldChange!]!
        "Validation issues found (for validate steps)"
        validationIssues: [DataHubSandboxValidationIssue!]!
    }

    # ============================================
    # LOAD PREVIEW TYPES
    # ============================================

    """
    Detail of a single load operation
    """
    type DataHubSandboxLoadOperationDetail {
        "Record index"
        recordIndex: Int!
        "Record ID from source"
        recordId: String
        "Target entity ID (for updates)"
        entityId: String
        "Reason for this operation"
        reason: String!
        "Record data"
        data: JSON!
        "Existing data (for updates)"
        existingData: JSON
        "Field diffs (for updates)"
        diff: [DataHubSandboxFieldDiff!]
    }

    """
    Summary of load operations by type
    """
    type DataHubSandboxLoadSummary {
        createCount: Int!
        updateCount: Int!
        deleteCount: Int!
        skipCount: Int!
        errorCount: Int!
    }

    """
    Grouped load operations
    """
    type DataHubSandboxLoadOperations {
        create: [DataHubSandboxLoadOperationDetail!]!
        update: [DataHubSandboxLoadOperationDetail!]!
        delete: [DataHubSandboxLoadOperationDetail!]!
        skip: [DataHubSandboxLoadOperationDetail!]!
        error: [DataHubSandboxLoadOperationDetail!]!
    }

    """
    Preview of load operations for a step
    """
    type DataHubSandboxLoadPreview {
        "Target entity type"
        entityType: String!
        "Loader adapter code"
        adapterCode: String!
        "Operations grouped by type"
        operations: DataHubSandboxLoadOperations!
        "Summary counts"
        summary: DataHubSandboxLoadSummary!
        "Warnings about the load operations"
        warnings: [String!]!
    }

    # ============================================
    # DATA LINEAGE TYPES
    # ============================================

    """
    State of a record at a specific step
    """
    type DataHubSandboxRecordState {
        "Step key"
        stepKey: String!
        "Step type"
        stepType: String!
        "State of the record"
        state: String!
        "Record data at this point"
        data: JSON!
        "Timestamp"
        timestamp: Float!
        "Notes about this state change"
        notes: String
    }

    """
    Complete lineage trace for a single record through the pipeline
    """
    type DataHubSandboxRecordLineage {
        "Index of this record"
        recordIndex: Int!
        "Original record ID from source"
        originalRecordId: String
        "Final record ID after processing"
        finalRecordId: String
        "Final outcome"
        finalOutcome: String!
        "States at each step"
        states: [DataHubSandboxRecordState!]!
    }

    # ============================================
    # WARNING AND ERROR TYPES
    # ============================================

    """
    Warning collected during sandbox execution
    """
    type DataHubSandboxWarning {
        "Step that generated the warning"
        stepKey: String!
        "Warning code"
        code: String!
        "Warning message"
        message: String!
        "Additional context"
        context: JSON
    }

    """
    Error collected during sandbox execution
    """
    type DataHubSandboxError {
        "Step that generated the error"
        stepKey: String!
        "Record index if applicable"
        recordIndex: Int
        "Error code"
        code: String!
        "Error message"
        message: String!
        "Stack trace if available"
        stack: String
        "Additional context"
        context: JSON
    }

    """
    Overall metrics from sandbox execution
    """
    type DataHubSandboxMetrics {
        totalRecordsProcessed: Int!
        totalRecordsSucceeded: Int!
        totalRecordsFailed: Int!
        totalRecordsFiltered: Int!
    }

    # ============================================
    # COMPLETE SANDBOX RESULT
    # ============================================

    """
    Complete result of sandbox/dry run execution
    """
    type DataHubSandboxResult {
        "Overall status"
        status: DataHubSandboxStatus!
        "Total execution time in milliseconds"
        totalDurationMs: Int!
        "Step-by-step execution results"
        steps: [DataHubSandboxStepResult!]!
        "Load operation previews"
        loadPreviews: [DataHubSandboxLoadPreview!]!
        "Overall metrics"
        metrics: DataHubSandboxMetrics!
        "All warnings collected"
        warnings: [DataHubSandboxWarning!]!
        "All errors collected"
        errors: [DataHubSandboxError!]!
        "Data lineage for record tracing"
        dataLineage: [DataHubSandboxRecordLineage!]!
    }

    # ============================================
    # INPUT TYPES
    # ============================================

    """
    Options for sandbox execution
    """
    input DataHubSandboxOptions {
        "Maximum records to process (default: 100)"
        maxRecords: Int
        "Maximum samples per step (default: 10)"
        maxSamplesPerStep: Int
        "Include full data lineage (default: true)"
        includeLineage: Boolean
        "Custom seed data to use"
        seedData: [JSON!]
        "Stop on first error (default: false)"
        stopOnError: Boolean
        "Timeout in milliseconds (default: 60000)"
        timeoutMs: Int
        "Steps to skip"
        skipSteps: [String!]
        "Start from a specific step (requires seed data)"
        startFromStep: String
    }

    """
    Input for executing sandbox with custom definition
    """
    input DataHubSandboxWithDefinitionInput {
        "Pipeline definition to test"
        definition: JSON!
        "Sandbox options"
        options: DataHubSandboxOptions
    }

    # ============================================
    # COMPARISON TYPES
    # ============================================

    """
    Comparison of two sandbox runs
    """
    type DataHubSandboxComparison {
        "First run result"
        before: DataHubSandboxResult!
        "Second run result"
        after: DataHubSandboxResult!
        "Summary of differences"
        summary: DataHubSandboxComparisonSummary!
        "Steps that changed"
        changedSteps: [DataHubSandboxStepComparison!]!
    }

    """
    Summary of differences between two sandbox runs
    """
    type DataHubSandboxComparisonSummary {
        "Total steps that changed behavior"
        stepsChanged: Int!
        "Records that would be processed differently"
        recordsAffected: Int!
        "Net change in success count"
        successCountDelta: Int!
        "Net change in failure count"
        failureCountDelta: Int!
        "Net change in filtered count"
        filteredCountDelta: Int!
        "Duration change"
        durationDeltaMs: Int!
    }

    """
    Comparison of a single step between two runs
    """
    type DataHubSandboxStepComparison {
        stepKey: String!
        stepName: String!
        "Records out in before run"
        recordsOutBefore: Int!
        "Records out in after run"
        recordsOutAfter: Int!
        "Duration in before run"
        durationBefore: Int!
        "Duration in after run"
        durationAfter: Int!
        "Fields that changed behavior"
        fieldChanges: [String!]!
    }
`;

export const sandboxQueries = `
    extend type Query {
        """
        Execute a comprehensive sandbox/dry run for a pipeline
        Returns detailed step-by-step results with record samples and field diffs
        """
        dataHubSandbox(pipelineId: ID!, options: DataHubSandboxOptions): DataHubSandboxResult!

        """
        Execute sandbox with a custom definition (for testing unpublished changes)
        """
        dataHubSandboxWithDefinition(input: DataHubSandboxWithDefinitionInput!): DataHubSandboxResult!

        """
        Compare sandbox results between two pipeline revisions
        """
        dataHubCompareSandboxResults(
            pipelineId: ID!
            fromRevisionId: ID!
            toRevisionId: ID!
            options: DataHubSandboxOptions
        ): DataHubSandboxComparison!

        """
        Get detailed record lineage for a specific record
        """
        dataHubRecordLineageDetail(
            pipelineId: ID!
            recordIndex: Int!
            options: DataHubSandboxOptions
        ): DataHubSandboxRecordLineage

        """
        Preview load operations for a pipeline
        """
        dataHubLoadPreview(
            pipelineId: ID!
            options: DataHubSandboxOptions
        ): [DataHubSandboxLoadPreview!]!
    }
`;

export const sandboxMutations = `
    extend type Mutation {
        """
        Execute sandbox with custom seed data for testing specific scenarios
        """
        dataHubTestWithSeedData(
            pipelineId: ID!
            seedData: [JSON!]!
            options: DataHubSandboxOptions
        ): DataHubSandboxResult!

        """
        Replay a specific step with custom input
        """
        dataHubReplayStep(
            pipelineId: ID!
            stepKey: String!
            inputData: [JSON!]!
            options: DataHubSandboxOptions
        ): DataHubSandboxStepResult!
    }
`;
