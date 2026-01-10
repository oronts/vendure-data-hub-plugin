# Pipeline Versioning & Impact Preview System Design

## Overview

Enterprise-grade versioning and impact preview system for DataHub pipelines providing:
- Hybrid versioning (auto-save drafts + explicit publish with commit messages)
- Timeline view with expandable details and diff preview
- Interactive sandbox for impact analysis before production runs
- Risk warnings without blocking (user responsibility model)

---

## Part 1: Versioning System

### 1.1 Data Model

**Enhanced PipelineRevision Entity:**

```typescript
@Entity('data_hub_pipeline_revision')
@Index(['pipelineId', 'version'])
@Index(['pipelineId', 'type'])
@Index(['createdAt'])
export class PipelineRevision extends VendureEntity {
    @ManyToOne(() => Pipeline, { onDelete: 'CASCADE' })
    pipeline!: Pipeline;

    @Index()
    @Column()
    pipelineId!: number;

    @Column({ default: 1 })
    version!: number;

    @Column('simple-json')
    definition!: PipelineDefinition;

    @Column({ type: 'varchar', length: 50, default: 'draft' })
    type!: 'draft' | 'published';

    @Column({ type: 'varchar', length: 500, nullable: true })
    commitMessage: string | null;

    @Column({ type: 'varchar', nullable: true })
    authorUserId: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    authorName: string | null;

    @Column({ type: 'simple-json', nullable: true })
    changesSummary: RevisionChangesSummary | null;

    @Column({ nullable: true })
    previousRevisionId: number | null;

    @Column({ type: 'int', default: 0 })
    definitionSize!: number;  // Bytes, for storage analytics
}

interface RevisionChangesSummary {
    stepsAdded: string[];
    stepsRemoved: string[];
    stepsModified: string[];
    triggersChanged: boolean;
    hooksChanged: boolean;
    configChanges: number;
    totalChanges: number;
}
```

**Pipeline Entity additions:**

```typescript
// Add to Pipeline entity
@Column({ nullable: true })
currentRevisionId: number | null;  // Points to active published version

@Column({ nullable: true })
draftRevisionId: number | null;    // Points to latest draft (if any)

@Column({ default: 0 })
publishedVersionCount!: number;    // Counter for published versions only
```

### 1.2 Version Numbering Strategy

- **Draft revisions**: No version number displayed, use timestamp
- **Published revisions**: Sequential integer (1, 2, 3...) per pipeline
- Display format: `v{publishedVersionCount}` for published, `Draft ({timestamp})` for drafts

### 1.3 Auto-Save Behavior

```typescript
interface AutoSaveConfig {
    enabled: boolean;
    throttleMs: 30000;           // 30 seconds between saves
    maxDraftsToKeep: 10;         // Prune old drafts automatically
    pruneOnPublish: boolean;     // Remove drafts when publishing
}
```

**Auto-save triggers:**
- Definition changes (steps, triggers, hooks)
- Debounced to prevent excessive saves
- Silent operation (no UI notification unless error)

**Draft cleanup:**
- Keep only last N drafts per pipeline
- Prune drafts older than 7 days (configurable)
- Remove all drafts when a new version is published

### 1.4 GraphQL Schema

```graphql
# Types
type DataHubPipelineRevision implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    version: Int!
    type: String!                    # 'draft' | 'published'
    commitMessage: String
    authorUserId: String
    authorName: String
    changesSummary: JSON
    definitionSize: Int!

    # Computed
    isLatest: Boolean!
    isCurrent: Boolean!              # Currently deployed version
    canRevert: Boolean!              # Has newer versions
}

type DataHubRevisionDiff {
    fromVersion: Int!
    toVersion: Int!
    added: [DataHubDiffEntry!]!
    removed: [DataHubDiffEntry!]!
    modified: [DataHubDiffEntry!]!
    unchangedCount: Int!
    summary: String!                 # Human-readable summary
}

type DataHubDiffEntry {
    path: String!                    # JSON path: "steps.transform-1.operators[2]"
    label: String!                   # Human-readable label
    type: String!                    # 'step' | 'trigger' | 'hook' | 'config' | 'edge'
    before: JSON
    after: JSON
}

type DataHubTimelineEntry {
    revision: DataHubPipelineRevision!
    runCount: Int!                   # How many runs used this version
    lastRunAt: DateTime
    lastRunStatus: String            # 'success' | 'failed' | 'partial'
}

# Queries
extend type Query {
    dataHubPipelineTimeline(
        pipelineId: ID!
        type: String                 # 'draft' | 'published' | null
        limit: Int = 50
        offset: Int = 0
    ): [DataHubTimelineEntry!]!

    dataHubRevisionDiff(
        fromId: ID!
        toId: ID!
    ): DataHubRevisionDiff!

    dataHubRevisionDefinition(
        revisionId: ID!
    ): JSON!
}

# Mutations
extend type Mutation {
    # Save draft (called by auto-save or manual save)
    saveDataHubPipelineDraft(
        pipelineId: ID!
        definition: JSON!
    ): DataHubPipelineRevision!

    # Publish with commit message (creates new published version)
    publishDataHubPipelineVersion(
        pipelineId: ID!
        commitMessage: String!
        definition: JSON              # Optional, uses current draft if not provided
    ): DataHubPipelineRevision!

    # Revert to specific revision
    revertDataHubToRevision(
        revisionId: ID!
        commitMessage: String         # Optional message for the revert
    ): DataHubPipelineRevision!

    # Delete specific draft revision
    deleteDataHubDraftRevision(
        revisionId: ID!
    ): Boolean!
}
```

### 1.5 Diff Algorithm

```typescript
interface DiffService {
    computeDiff(from: PipelineDefinition, to: PipelineDefinition): RevisionDiff;
    generateSummary(diff: RevisionDiff): string;
    getHumanReadableLabel(path: string, definition: PipelineDefinition): string;
}

// Diff computation approach:
// 1. Deep compare definitions using json-diff or similar
// 2. Categorize changes by type (step, trigger, hook, edge, config)
// 3. Generate human-readable labels for each change
// 4. Compute summary statistics
```

---

## Part 2: Impact Preview / Interactive Sandbox

### 2.1 Impact Analysis Data Model

```typescript
interface ImpactAnalysis {
    summary: ImpactSummary;
    entityBreakdown: EntityImpact[];
    riskAssessment: RiskAssessment;
    sampleRecords: SampleRecordFlow[];
    estimatedDuration: DurationEstimate;
    resourceUsage: ResourceEstimate;
}

interface ImpactSummary {
    totalRecordsToProcess: number;
    estimatedSuccessCount: number;
    estimatedFailureCount: number;
    estimatedSkipCount: number;
    affectedEntities: string[];
}

interface EntityImpact {
    entityType: string;              # 'Product' | 'Variant' | 'Customer' | etc.
    operations: {
        create: number;
        update: number;
        delete: number;
        skip: number;
        error: number;
    };
    fieldChanges: FieldChangePreview[];
    sampleIds: string[];             # IDs of affected records for drill-down
}

interface FieldChangePreview {
    field: string;
    changeType: 'set' | 'update' | 'remove' | 'transform';
    affectedCount: number;
    sampleBefore: any[];
    sampleAfter: any[];
}

interface RiskAssessment {
    level: 'low' | 'medium' | 'high' | 'critical';
    warnings: RiskWarning[];
    score: number;                   # 0-100
}

interface RiskWarning {
    type: string;
    severity: 'info' | 'warning' | 'danger';
    message: string;
    details: string;
    affectedCount?: number;
    recommendation?: string;
}

interface SampleRecordFlow {
    recordId: string;
    sourceData: any;
    steps: StepTransformation[];
    finalData: any;
    outcome: 'success' | 'filtered' | 'error';
    errorMessage?: string;
}

interface StepTransformation {
    stepKey: string;
    stepType: string;
    input: any;
    output: any;
    duration: number;
    notes: string[];
}

interface DurationEstimate {
    estimatedMs: number;
    confidence: 'low' | 'medium' | 'high';
    breakdown: {
        extract: number;
        transform: number;
        load: number;
    };
    basedOn: string;                 # 'historical' | 'sampling' | 'estimate'
}

interface ResourceEstimate {
    memoryMb: number;
    cpuPercent: number;
    networkCalls: number;
    databaseQueries: number;
}
```

### 2.2 GraphQL Schema for Impact Preview

```graphql
# Types
type DataHubImpactSummary {
    totalRecordsToProcess: Int!
    estimatedSuccessCount: Int!
    estimatedFailureCount: Int!
    estimatedSkipCount: Int!
    affectedEntities: [String!]!
}

type DataHubEntityImpact {
    entityType: String!
    createCount: Int!
    updateCount: Int!
    deleteCount: Int!
    skipCount: Int!
    errorCount: Int!
    fieldChanges: [DataHubFieldChangePreview!]!
    sampleRecordIds: [String!]!
}

type DataHubFieldChangePreview {
    field: String!
    changeType: String!
    affectedCount: Int!
    sampleBefore: [JSON!]!
    sampleAfter: [JSON!]!
}

type DataHubRiskWarning {
    type: String!
    severity: String!               # 'info' | 'warning' | 'danger'
    message: String!
    details: String!
    affectedCount: Int
    recommendation: String
}

type DataHubRiskAssessment {
    level: String!                  # 'low' | 'medium' | 'high' | 'critical'
    score: Int!                     # 0-100
    warnings: [DataHubRiskWarning!]!
}

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

type DataHubSampleRecordFlow {
    recordId: String!
    sourceData: JSON!
    steps: [DataHubStepTransformation!]!
    finalData: JSON
    outcome: String!                # 'success' | 'filtered' | 'error'
    errorMessage: String
}

type DataHubDurationEstimate {
    estimatedMs: Int!
    confidence: String!
    extractMs: Int!
    transformMs: Int!
    loadMs: Int!
    basedOn: String!
}

type DataHubImpactAnalysis {
    summary: DataHubImpactSummary!
    entityBreakdown: [DataHubEntityImpact!]!
    riskAssessment: DataHubRiskAssessment!
    sampleRecords: [DataHubSampleRecordFlow!]!
    estimatedDuration: DataHubDurationEstimate!
    analyzedAt: DateTime!
    sampleSize: Int!
    fullDatasetSize: Int
}

type DataHubRecordDetail {
    recordId: String!
    entityType: String!
    operation: String!              # 'create' | 'update' | 'delete' | 'skip'
    currentState: JSON              # Current database state (for updates)
    proposedState: JSON!            # What it will become
    diff: JSON                      # Field-level diff for updates
    validationErrors: [String!]
    warnings: [String!]
}

# Queries
extend type Query {
    # Full impact analysis (runs sampling)
    dataHubImpactAnalysis(
        pipelineId: ID!
        sampleSize: Int = 100       # Number of records to sample
        fullScan: Boolean = false   # If true, analyze all records (slower)
    ): DataHubImpactAnalysis!

    # Get detailed view of specific record's transformation
    dataHubRecordFlowDetail(
        pipelineId: ID!
        recordId: String!           # Source record ID
    ): DataHubSampleRecordFlow!

    # Get details of a specific affected record
    dataHubAffectedRecordDetail(
        pipelineId: ID!
        entityType: String!
        entityId: String!
    ): DataHubRecordDetail!

    # List affected records for an entity type
    dataHubAffectedRecords(
        pipelineId: ID!
        entityType: String!
        operation: String           # Filter by operation type
        limit: Int = 50
        offset: Int = 0
    ): [DataHubRecordDetail!]!
}

# Mutations
extend type Mutation {
    # Run impact analysis and cache results
    analyzeDataHubPipelineImpact(
        pipelineId: ID!
        options: DataHubImpactAnalysisOptions
    ): DataHubImpactAnalysis!
}

input DataHubImpactAnalysisOptions {
    sampleSize: Int = 100
    includeFieldChanges: Boolean = true
    includeResourceEstimate: Boolean = true
    maxDurationMs: Int = 60000      # Timeout for analysis
}
```

### 2.3 Risk Warning Rules

```typescript
const RISK_RULES: RiskRule[] = [
    // High volume operations
    {
        id: 'high-record-count',
        check: (impact) => impact.summary.totalRecordsToProcess > 10000,
        severity: 'warning',
        message: 'Large dataset: {count} records will be processed',
        recommendation: 'Consider running in batches or during off-peak hours'
    },
    {
        id: 'mass-update',
        check: (impact) => {
            const updates = impact.entityBreakdown.reduce((sum, e) => sum + e.operations.update, 0);
            return updates > 5000;
        },
        severity: 'warning',
        message: 'Mass update: {count} records will be modified',
        recommendation: 'Verify update criteria are correct'
    },
    {
        id: 'mass-delete',
        check: (impact) => {
            const deletes = impact.entityBreakdown.reduce((sum, e) => sum + e.operations.delete, 0);
            return deletes > 100;
        },
        severity: 'danger',
        message: 'Mass delete: {count} records will be removed',
        recommendation: 'Double-check delete conditions; consider archiving instead'
    },

    // Data quality
    {
        id: 'high-error-rate',
        check: (impact) => {
            const errorRate = impact.summary.estimatedFailureCount / impact.summary.totalRecordsToProcess;
            return errorRate > 0.1;  // More than 10% errors
        },
        severity: 'danger',
        message: 'High error rate: {percent}% of records may fail',
        recommendation: 'Review source data quality and validation rules'
    },
    {
        id: 'high-skip-rate',
        check: (impact) => {
            const skipRate = impact.summary.estimatedSkipCount / impact.summary.totalRecordsToProcess;
            return skipRate > 0.5;  // More than 50% skipped
        },
        severity: 'warning',
        message: 'High skip rate: {percent}% of records will be skipped',
        recommendation: 'Verify filter conditions match your intent'
    },

    // Performance
    {
        id: 'long-duration',
        check: (impact) => impact.estimatedDuration.estimatedMs > 600000,  // 10 minutes
        severity: 'info',
        message: 'Long running: Estimated duration {duration}',
        recommendation: 'Consider scheduling for off-peak hours'
    },
    {
        id: 'low-confidence-estimate',
        check: (impact) => impact.estimatedDuration.confidence === 'low',
        severity: 'info',
        message: 'Duration estimate has low confidence',
        recommendation: 'First run may take longer than estimated'
    },

    // Sensitive operations
    {
        id: 'price-changes',
        check: (impact) => {
            return impact.entityBreakdown.some(e =>
                e.fieldChanges.some(f => f.field.includes('price') && f.affectedCount > 100)
            );
        },
        severity: 'warning',
        message: 'Price changes: {count} products will have price updates',
        recommendation: 'Verify pricing data is correct before proceeding'
    },
    {
        id: 'customer-data-changes',
        check: (impact) => {
            return impact.entityBreakdown.some(e =>
                e.entityType === 'Customer' && (e.operations.update > 100 || e.operations.delete > 0)
            );
        },
        severity: 'warning',
        message: 'Customer data changes detected',
        recommendation: 'Ensure compliance with data protection policies'
    },

    // First run
    {
        id: 'first-run',
        check: (impact, context) => context.previousRunCount === 0,
        severity: 'info',
        message: 'First run for this pipeline',
        recommendation: 'Consider running with a smaller dataset first'
    }
];

function computeRiskScore(warnings: RiskWarning[]): number {
    const weights = { info: 5, warning: 20, danger: 40 };
    const score = warnings.reduce((sum, w) => sum + weights[w.severity], 0);
    return Math.min(100, score);
}

function computeRiskLevel(score: number): string {
    if (score >= 80) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
}
```

### 2.4 Interactive Sandbox Service

```typescript
@Injectable()
export class ImpactAnalysisService {
    async analyzeImpact(
        ctx: RequestContext,
        pipelineId: ID,
        options: ImpactAnalysisOptions
    ): Promise<ImpactAnalysis> {
        const pipeline = await this.pipelineService.findOne(ctx, pipelineId);
        const definition = pipeline.definition;

        // 1. Run extract step with sampling
        const extractedRecords = await this.sampleExtract(ctx, definition, options.sampleSize);

        // 2. Process through transforms (tracking each step)
        const recordFlows = await this.processWithTracking(ctx, definition, extractedRecords);

        // 3. Simulate load step (without writing)
        const loadSimulation = await this.simulateLoad(ctx, definition, recordFlows);

        // 4. Compute entity breakdown
        const entityBreakdown = this.computeEntityBreakdown(loadSimulation);

        // 5. Estimate full dataset impact (extrapolate from sample)
        const fullDatasetSize = await this.estimateFullDatasetSize(ctx, definition);
        const extrapolatedSummary = this.extrapolateImpact(
            entityBreakdown,
            options.sampleSize,
            fullDatasetSize
        );

        // 6. Compute risk assessment
        const riskAssessment = this.assessRisk(extrapolatedSummary, entityBreakdown, {
            previousRunCount: await this.getRunCount(pipelineId)
        });

        // 7. Estimate duration
        const durationEstimate = await this.estimateDuration(ctx, pipelineId, fullDatasetSize);

        return {
            summary: extrapolatedSummary,
            entityBreakdown,
            riskAssessment,
            sampleRecords: recordFlows,
            estimatedDuration: durationEstimate,
            resourceUsage: this.estimateResources(definition, fullDatasetSize)
        };
    }

    async getRecordFlowDetail(
        ctx: RequestContext,
        pipelineId: ID,
        recordId: string
    ): Promise<SampleRecordFlow> {
        // Run single record through pipeline with full tracking
        const pipeline = await this.pipelineService.findOne(ctx, pipelineId);
        const record = await this.fetchSpecificRecord(ctx, pipeline.definition, recordId);
        return this.processRecordWithFullTracking(ctx, pipeline.definition, record);
    }

    async getAffectedRecordDetail(
        ctx: RequestContext,
        pipelineId: ID,
        entityType: string,
        entityId: string
    ): Promise<RecordDetail> {
        // Get current state and proposed changes for specific entity
        const currentState = await this.fetchCurrentEntityState(ctx, entityType, entityId);
        const pipeline = await this.pipelineService.findOne(ctx, pipelineId);
        const proposedState = await this.computeProposedState(ctx, pipeline, entityType, entityId);

        return {
            recordId: entityId,
            entityType,
            operation: this.determineOperation(currentState, proposedState),
            currentState,
            proposedState,
            diff: this.computeFieldDiff(currentState, proposedState),
            validationErrors: await this.validateProposedState(proposedState),
            warnings: this.checkRecordWarnings(currentState, proposedState)
        };
    }
}
```

---

## Part 3: Implementation Plan

### Phase 1: Database & Core Services (2-3 days)

1. **Migrations**
   - Add new columns to PipelineRevision entity
   - Add currentRevisionId, draftRevisionId to Pipeline entity
   - Create indexes for efficient queries

2. **Revision Service**
   - `saveDraft()` - Create/update draft revision
   - `publishVersion()` - Create published revision with commit message
   - `revertToRevision()` - Revert to specific revision
   - `getTimeline()` - Get revisions with run statistics
   - `pruneDrafts()` - Cleanup old drafts

3. **Diff Service**
   - `computeDiff()` - Deep compare two definitions
   - `generateChangesSummary()` - Create summary for storage
   - `getHumanReadableLabel()` - Convert JSON paths to labels

### Phase 2: Impact Analysis Service (3-4 days)

1. **Sampling Service**
   - Sample extract with configurable size
   - Track transformations per record
   - Simulate load without writes

2. **Impact Computation**
   - Entity breakdown calculation
   - Field change detection
   - Extrapolation from sample to full dataset

3. **Risk Assessment**
   - Implement risk rules
   - Compute scores and levels
   - Generate warnings with recommendations

4. **Duration Estimation**
   - Historical run analysis
   - Extrapolation from sample timing
   - Confidence calculation

### Phase 3: GraphQL API (1-2 days)

1. **Schema additions** (as defined above)
2. **Resolvers** for all new queries/mutations
3. **Caching** for impact analysis results

### Phase 4: Testing & Refinement (2 days)

1. Unit tests for diff algorithm
2. Integration tests for versioning flow
3. Performance tests for large datasets
4. UI integration testing

---

## Part 4: File Structure

```
src/
├── services/
│   ├── versioning/
│   │   ├── revision.service.ts
│   │   ├── diff.service.ts
│   │   ├── draft-pruning.service.ts
│   │   └── index.ts
│   └── impact-analysis/
│       ├── impact-analysis.service.ts
│       ├── sampling.service.ts
│       ├── risk-assessment.service.ts
│       ├── duration-estimator.service.ts
│       ├── risk-rules.ts
│       └── index.ts
├── api/
│   ├── schema/
│   │   ├── versioning.schema.ts
│   │   └── impact-analysis.schema.ts
│   └── resolvers/
│       ├── versioning.resolver.ts
│       └── impact-analysis.resolver.ts
├── entities/
│   └── pipeline/
│       └── pipeline-revision.entity.ts  # Enhanced
└── types/
    ├── versioning.types.ts
    └── impact-analysis.types.ts
```

---

## Summary

This design provides:

1. **Robust Versioning**
   - Auto-save drafts with throttling
   - Explicit publishing with commit messages
   - Full diff capability between any versions
   - Timeline view with run statistics

2. **Comprehensive Impact Preview**
   - Sample-based analysis with extrapolation
   - Entity-level and field-level breakdown
   - Interactive drill-down to specific records
   - Full record flow visualization

3. **Risk Awareness**
   - Automated risk detection rules
   - Severity-based warnings
   - Recommendations for risky operations
   - No blocking (user responsibility)

4. **Enterprise Ready**
   - Audit trail via revisions
   - Performance optimized (sampling, caching)
   - Scalable to large datasets
   - Clear API contracts
