/**
 * Impact Analysis Types
 *
 * Types for the interactive sandbox and impact preview system.
 */

/**
 * Summary of the overall impact
 */
export interface ImpactSummary {
    /** Total records that will be processed */
    totalRecordsToProcess: number;
    /** Estimated successful records */
    estimatedSuccessCount: number;
    /** Estimated failed records */
    estimatedFailureCount: number;
    /** Estimated skipped records */
    estimatedSkipCount: number;
    /** List of affected entity types */
    affectedEntities: string[];
}

/**
 * Operations breakdown for an entity type
 */
export interface EntityOperations {
    create: number;
    update: number;
    delete: number;
    skip: number;
    error: number;
}

/**
 * Preview of field changes
 */
export interface FieldChangePreview {
    /** Field name/path */
    field: string;
    /** Type of change - matches GraphQL DataHubFieldChangeType enum */
    changeType: 'SET' | 'UPDATE' | 'REMOVE' | 'TRANSFORM';
    /** Number of records affected */
    affectedCount: number;
    /** Sample of values before change */
    sampleBefore: unknown[];
    /** Sample of values after change */
    sampleAfter: unknown[];
}

/**
 * Impact breakdown for a specific entity type
 */
export interface EntityImpact {
    /** Entity type name: Product, Variant, Customer, etc. */
    entityType: string;
    /** Operations breakdown */
    operations: EntityOperations;
    /** Field-level change previews */
    fieldChanges: FieldChangePreview[];
    /** Sample record IDs for drill-down */
    sampleRecordIds: string[];
}

/**
 * Risk warning with details and recommendations
 */
export interface RiskWarning {
    /** Warning type identifier */
    type: string;
    /** Severity level */
    severity: 'INFO' | 'WARNING' | 'DANGER';
    /** Short warning message */
    message: string;
    /** Detailed explanation */
    details: string;
    /** Number of affected items (if applicable) */
    affectedCount?: number;
    /** Recommended action */
    recommendation?: string;
}

/**
 * Overall risk assessment result
 */
export interface RiskAssessment {
    /** Risk level classification */
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    /** Risk score (0-100) */
    score: number;
    /** List of warnings */
    warnings: RiskWarning[];
}

/**
 * Transformation details for a single step
 */
export interface StepTransformation {
    /** Step identifier */
    stepKey: string;
    /** Step type: extract, transform, load, etc. */
    stepType: string;
    /** Human-readable step name */
    stepName: string;
    /** Input data to the step */
    input: unknown;
    /** Output data from the step */
    output: unknown;
    /** Processing time in milliseconds */
    durationMs: number;
    /** Notes/logs from the step */
    notes: string[];
    /** Number of records entering the step */
    recordsIn: number;
    /** Number of records leaving the step */
    recordsOut: number;
}

/**
 * Complete flow of a single record through the pipeline
 */
export interface SampleRecordFlow {
    /** Record identifier */
    recordId: string;
    /** Original source data */
    sourceData: unknown;
    /** Transformations at each step */
    steps: StepTransformation[];
    /** Final output data */
    finalData: unknown | null;
    /** Processing outcome */
    outcome: 'SUCCESS' | 'FILTERED' | 'ERROR';
    /** Error message if failed */
    errorMessage?: string;
}

/**
 * Duration estimate with confidence
 */
export interface DurationEstimate {
    /** Estimated total duration in milliseconds */
    estimatedMs: number;
    /** Confidence level of the estimate */
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    /** Extract phase duration */
    extractMs: number;
    /** Transform phase duration */
    transformMs: number;
    /** Load phase duration */
    loadMs: number;
    /** Basis for the estimate */
    basedOn: 'HISTORICAL' | 'SAMPLING' | 'ESTIMATE';
}

/**
 * Resource usage estimate
 */
export interface ResourceEstimate {
    /** Estimated memory usage in MB */
    memoryMb: number;
    /** Estimated CPU usage percentage */
    cpuPercent: number;
    /** Number of network calls */
    networkCalls: number;
    /** Number of database queries */
    databaseQueries: number;
}

/**
 * Complete impact analysis result
 */
export interface ImpactAnalysis {
    /** Overall summary */
    summary: ImpactSummary;
    /** Breakdown by entity type */
    entityBreakdown: EntityImpact[];
    /** Risk assessment */
    riskAssessment: RiskAssessment;
    /** Sample record flows */
    sampleRecords: SampleRecordFlow[];
    /** Duration estimate */
    estimatedDuration: DurationEstimate;
    /** Resource usage estimate */
    resourceUsage: ResourceEstimate;
    /** When the analysis was performed */
    analyzedAt: Date;
    /** Sample size used for analysis */
    sampleSize: number;
    /** Full dataset size (if known) */
    fullDatasetSize: number | null;
}

/**
 * Options for impact analysis
 */
export interface ImpactAnalysisOptions {
    /** Number of records to sample */
    sampleSize?: number;
    /** Whether to include field-level changes */
    includeFieldChanges?: boolean;
    /** Whether to include resource estimates */
    includeResourceEstimate?: boolean;
    /** Maximum duration for analysis in ms */
    maxDurationMs?: number;
}

/**
 * Default impact analysis options
 */
export const DEFAULT_IMPACT_ANALYSIS_OPTIONS: Required<ImpactAnalysisOptions> = {
    sampleSize: 100,
    includeFieldChanges: true,
    includeResourceEstimate: true,
    maxDurationMs: 60000,
};

/**
 * Detail view of an affected record
 */
export interface RecordDetail {
    /** Record identifier */
    recordId: string;
    /** Entity type */
    entityType: string;
    /** Operation to be performed - matches GraphQL DataHubRecordOperation enum */
    operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'SKIP';
    /** Current state in database (for updates) */
    currentState: unknown | null;
    /** Proposed new state */
    proposedState: unknown;
    /** Field-level diff for updates */
    diff: Record<string, { before: unknown; after: unknown }> | null;
    /** Validation errors */
    validationErrors: string[];
    /** Warnings */
    warnings: string[];
}

/**
 * Risk rule definition
 */
export interface RiskRule {
    /** Unique rule identifier */
    id: string;
    /** Function to check if rule applies */
    check: (impact: ImpactAnalysis, context: RiskContext) => boolean;
    /** Severity if rule matches */
    severity: 'INFO' | 'WARNING' | 'DANGER';
    /** Message template (supports {placeholders}) */
    message: string;
    /** Recommendation text */
    recommendation?: string;
}

/**
 * Context for risk assessment
 */
export interface RiskContext {
    /** Number of previous runs for this pipeline */
    previousRunCount: number;
    /** Last run status */
    lastRunStatus?: 'SUCCESS' | 'FAILED' | 'PARTIAL';
    /** Pipeline configuration */
    pipelineConfig?: unknown;
}
