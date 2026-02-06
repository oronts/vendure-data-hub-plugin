export const versioningSchema = `
    """
    Pipeline revision with author, commit message, and change tracking
    """
    type DataHubPipelineRevisionExtended implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        version: Int!
        "Type of revision: draft (auto-save) or published (explicit version)"
        type: DataHubRevisionType!
        "User-provided description of changes"
        commitMessage: String
        authorUserId: String
        "Display name of the author"
        authorName: String
        "Summary of changes from previous revision"
        changesSummary: JSON
        "Reference to previous revision for diff"
        previousRevisionId: ID
        "Size of definition in bytes"
        definitionSize: Int!
        "Hash for quick change detection"
        definitionHash: String
        definition: JSON!
    }

    enum DataHubRevisionType {
        DRAFT
        PUBLISHED
    }

    """
    Timeline entry showing revision with run statistics
    """
    type DataHubTimelineEntry {
        revision: DataHubTimelineRevision!
        "Number of runs using this revision"
        runCount: Int!
        "When the last run was executed"
        lastRunAt: DateTime
        "Status of the last run"
        lastRunStatus: DataHubRunOutcome
    }

    type DataHubTimelineRevision {
        id: ID!
        createdAt: DateTime!
        version: Int!
        type: DataHubRevisionType!
        commitMessage: String
        authorName: String
        changesSummary: JSON
        "Whether this is the latest revision"
        isLatest: Boolean!
        "Whether this is the currently active revision"
        isCurrent: Boolean!
    }

    enum DataHubRunOutcome {
        SUCCESS
        FAILED
        PARTIAL
    }

    """
    Diff entry showing a single change between revisions
    """
    type DataHubDiffEntry {
        "JSON path to the changed element"
        path: String!
        "Human-readable label"
        label: String!
        "Type of element changed"
        type: DataHubDiffType!
        "Value before the change"
        before: JSON
        "Value after the change"
        after: JSON
    }

    enum DataHubDiffType {
        STEP
        TRIGGER
        HOOK
        EDGE
        CONFIG
        META
    }

    """
    Complete diff between two revisions
    """
    type DataHubRevisionDiff {
        fromVersion: Int!
        toVersion: Int!
        "Elements that were added"
        added: [DataHubDiffEntry!]!
        "Elements that were removed"
        removed: [DataHubDiffEntry!]!
        "Elements that were modified"
        modified: [DataHubDiffEntry!]!
        "Count of unchanged elements"
        unchangedCount: Int!
        "Human-readable summary"
        summary: String!
    }

    # --- Impact Analysis Types ---

    """
    Overall impact summary
    """
    type DataHubImpactSummary {
        totalRecordsToProcess: Int!
        estimatedSuccessCount: Int!
        estimatedFailureCount: Int!
        estimatedSkipCount: Int!
        affectedEntities: [String!]!
    }

    """
    Operations breakdown for an entity type
    """
    type DataHubEntityOperations {
        create: Int!
        update: Int!
        delete: Int!
        skip: Int!
        error: Int!
    }

    """
    Field change preview
    """
    type DataHubFieldChangePreview {
        field: String!
        changeType: DataHubFieldChangeType!
        affectedCount: Int!
        sampleBefore: [JSON!]!
        sampleAfter: [JSON!]!
    }

    enum DataHubFieldChangeType {
        SET
        UPDATE
        REMOVE
        TRANSFORM
    }

    """
    Impact breakdown for a specific entity type
    """
    type DataHubEntityImpact {
        entityType: String!
        operations: DataHubEntityOperations!
        fieldChanges: [DataHubFieldChangePreview!]!
        sampleRecordIds: [String!]!
    }

    """
    Risk warning with details
    """
    type DataHubRiskWarning {
        type: String!
        severity: DataHubRiskSeverity!
        message: String!
        details: String!
        affectedCount: Int
        recommendation: String
    }

    enum DataHubRiskSeverity {
        INFO
        WARNING
        DANGER
    }

    """
    Overall risk assessment
    """
    type DataHubRiskAssessment {
        level: DataHubRiskLevel!
        score: Int!
        warnings: [DataHubRiskWarning!]!
    }

    enum DataHubRiskLevel {
        LOW
        MEDIUM
        HIGH
        CRITICAL
    }

    """
    Transformation details for a step
    """
    type DataHubStepTransformation {
        stepKey: String!
        stepType: String!
        stepName: String!
        input: JSON!
        output: JSON!
        durationMs: Int!
        notes: [String!]!
        recordsIn: Int!
        recordsOut: Int!
    }

    """
    Flow of a record through the pipeline
    """
    type DataHubSampleRecordFlow {
        recordId: String!
        sourceData: JSON!
        steps: [DataHubStepTransformation!]!
        finalData: JSON
        outcome: DataHubRecordOutcome!
        errorMessage: String
    }

    enum DataHubRecordOutcome {
        SUCCESS
        FILTERED
        ERROR
    }

    """
    Duration estimate with confidence
    """
    type DataHubDurationEstimate {
        estimatedMs: Int!
        confidence: DataHubConfidenceLevel!
        extractMs: Int!
        transformMs: Int!
        loadMs: Int!
        basedOn: DataHubEstimateBasis!
    }

    enum DataHubConfidenceLevel {
        LOW
        MEDIUM
        HIGH
    }

    enum DataHubEstimateBasis {
        HISTORICAL
        SAMPLING
        ESTIMATE
    }

    """
    Resource usage estimate
    """
    type DataHubResourceEstimate {
        memoryMb: Int!
        cpuPercent: Int!
        networkCalls: Int!
        databaseQueries: Int!
    }

    """
    Complete impact analysis result
    """
    type DataHubImpactAnalysis {
        summary: DataHubImpactSummary!
        entityBreakdown: [DataHubEntityImpact!]!
        riskAssessment: DataHubRiskAssessment!
        sampleRecords: [DataHubSampleRecordFlow!]!
        estimatedDuration: DataHubDurationEstimate!
        resourceUsage: DataHubResourceEstimate!
        analyzedAt: DateTime!
        sampleSize: Int!
        fullDatasetSize: Int
    }

    """
    Detailed record preview
    """
    type DataHubRecordDetail {
        recordId: String!
        entityType: String!
        operation: DataHubRecordOperation!
        currentState: JSON
        proposedState: JSON!
        diff: JSON
        validationErrors: [String!]!
        warnings: [String!]!
    }

    enum DataHubRecordOperation {
        CREATE
        UPDATE
        DELETE
        SKIP
    }

    """
    Step analysis result
    """
    type DataHubStepAnalysis {
        stepKey: String!
        recordsIn: Int!
        recordsOut: Int!
        transformations: [DataHubStepTransformation!]!
        fieldChanges: [DataHubFieldChangePreview!]!
    }

    # --- Input Types ---

    input DataHubSaveDraftInput {
        pipelineId: ID!
        definition: JSON!
    }

    input DataHubPublishVersionInput {
        pipelineId: ID!
        commitMessage: String!
        "Optional: provide definition, otherwise uses current pipeline definition"
        definition: JSON
    }

    input DataHubRevertInput {
        revisionId: ID!
        "Optional: custom commit message"
        commitMessage: String
    }

    input DataHubImpactAnalysisOptions {
        "Number of records to sample (default: 100)"
        sampleSize: Int
        "Include field-level changes (default: true)"
        includeFieldChanges: Boolean
        "Include resource estimates (default: true)"
        includeResourceEstimate: Boolean
        "Maximum duration for analysis in ms (default: 60000)"
        maxDurationMs: Int
    }
`;

export const versioningQueries = `
    extend type Query {
        "Get timeline of revisions for a pipeline"
        dataHubPipelineTimeline(pipelineId: ID!, limit: Int): [DataHubTimelineEntry!]!

        "Get diff between two revisions"
        dataHubRevisionDiff(fromRevisionId: ID!, toRevisionId: ID!): DataHubRevisionDiff!

        "Get a specific revision"
        dataHubRevision(revisionId: ID!): DataHubPipelineRevisionExtended

        "Check if pipeline has unpublished changes"
        dataHubHasUnpublishedChanges(pipelineId: ID!): Boolean!

        "Get impact analysis for a pipeline"
        dataHubImpactAnalysis(pipelineId: ID!, options: DataHubImpactAnalysisOptions): DataHubImpactAnalysis!

        "Get detailed record information for drill-down"
        dataHubRecordDetails(pipelineId: ID!, recordIds: [String!]!): [DataHubRecordDetail!]!

        "Analyze impact of a specific step"
        dataHubStepAnalysis(pipelineId: ID!, stepKey: String!, options: DataHubImpactAnalysisOptions): DataHubStepAnalysis!
    }
`;

export const versioningMutations = `
    extend type Mutation {
        "Save a draft revision (auto-save)"
        dataHubSaveDraft(input: DataHubSaveDraftInput!): DataHubPipelineRevisionExtended

        "Publish a new version with commit message"
        dataHubPublishVersion(input: DataHubPublishVersionInput!): DataHubPipelineRevisionExtended!

        "Revert to a specific revision (creates new published version)"
        dataHubRevertToRevision(input: DataHubRevertInput!): DataHubPipelineRevisionExtended!

        "Restore a draft to the working copy (without publishing)"
        dataHubRestoreDraft(revisionId: ID!): DataHubPipeline!

        "Prune old draft revisions"
        dataHubPruneDrafts(pipelineId: ID!): Int!
    }
`;
