# Implementation Plan: 8 Architectural Gaps

## Context

The data-hub plugin has 15 supported ETL scenarios and 8 identified gaps. This plan implements all 8 gaps, leveraging existing extension points (operator registry, loader dispatch, graph executor, connector registry) to minimize new abstractions.

## Architecture Key Points

- **Graph executor** already supports parallel execution (`ParallelExecutionConfig` in `graph-executor.ts:250-266`)
- **Operator registry** has 57 built-in operators in `operator-runtime-registry.ts` with dynamic registration via `DataHubRegistryService.registerRuntime()`
- **Loader dispatch** uses handler map + registry fallback in `load.executor.ts:82-97`
- **Step types**: TRIGGER, EXTRACT, TRANSFORM, VALIDATE, ENRICH, ROUTE, LOAD, EXPORT, FEED, SINK
- **SDK DSL**: `pipeline-builder.ts` (fluent builder), `transform-builder.ts` (50+ operator factories), `step-configs.ts` (all config types)

---

## Gap 1: Multi-Source Join Operator

**What**: New `join` operator that merges records from two datasets by matching on key fields (inner, left, right, full outer join).

**Approach**: Add as a new operator in `src/operators/aggregation/` following the existing operator pattern (definition + runtime fn + register in operator-runtime-registry).

**Files to create:**
- `src/operators/aggregation/join.operator.ts` - Join operator implementation

**Files to modify:**
- `src/operators/aggregation/index.ts` - Export new operator
- `src/operators/operator-runtime-registry.ts` - Register `join` operator
- `src/sdk/dsl/transform-builder.ts` - Add `operators.join()` DSL method
- `src/sdk/constants.ts` - Add `JOIN` to `TRANSFORM_OPERATOR` constant
- `shared/types/operator.types.ts` - Add `JoinOperatorConfig` type

**Implementation:**
```typescript
// join.operator.ts
interface JoinConfig {
  leftKey: string;       // Field to match on left (primary) dataset
  rightKey: string;      // Field to match on right dataset
  rightData: JsonObject[]; // Right-side dataset (from config or prior step)
  rightDataPath?: string; // OR: path to right-side data in record metadata
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  prefix?: string;       // Prefix for right-side fields to avoid collisions
  select?: string[];     // Which right-side fields to include
}
```

The operator receives the primary dataset as `records[]` and the join dataset from config (`rightData`) or from a pipeline variable/metadata path. Records are matched by key fields and merged.

**DSL:**
```typescript
operators.join({
  leftKey: 'productId',
  rightKey: 'id',
  rightDataPath: '$.steps.prices.output',
  type: 'LEFT',
  prefix: 'price_',
})
```

---

## Gap 2: True Parallel Step Execution

**What**: Already implemented in `graph-executor.ts:355-476`. The `executeParallel()` function uses topological sort + Promise.race with configurable concurrency.

**What's missing**: SDK DSL exposure and dashboard UI toggle.

**Files to modify:**
- `src/sdk/dsl/pipeline-builder.ts` - Add `.parallel()` method to builder
- `src/sdk/dsl/step-configs.ts` - Already has support via `PipelineContext.parallelExecution`
- `dashboard/components/wizards/import-wizard/ImportWizard.tsx` - Add parallel toggle in advanced settings (optional, UI-only)
- `dashboard/routes/pipelines/components/` - Add parallel config in pipeline editor (optional)

**DSL addition:**
```typescript
createPipeline()
  .name('Parallel Import')
  .context({
    parallelExecution: { enabled: true, maxConcurrentSteps: 4, errorPolicy: 'BEST_EFFORT' }
  })
  // ... steps
  .build();

// OR shorthand:
createPipeline()
  .parallel({ maxConcurrentSteps: 4, errorPolicy: 'BEST_EFFORT' })
  // ... steps
  .build();
```

---

## Gap 3: Per-Record Retry in Transforms

**What**: Currently transform errors skip the record. Add per-record retry with configurable attempts and backoff.

**Approach**: Add retry logic to the transform executor's record processing loop. Configure via `TransformStepConfig`.

**Files to modify:**
- `src/sdk/dsl/step-configs.ts` - Add `retryPerRecord` to `TransformStepConfig`
- `src/runtime/executors/transform.executor.ts` - Add per-record retry wrapper
- `shared/types/pipeline.types.ts` - Already has `ErrorHandlingConfig` with `maxRetries`/`retryDelayMs`

**Config addition:**
```typescript
interface TransformStepConfig {
  operators: OperatorConfig[];
  throughput?: Throughput;
  async?: boolean;
  retryPerRecord?: {
    maxRetries: number;      // default 0 (no retry)
    retryDelayMs?: number;   // default 100
    backoff?: 'FIXED' | 'EXPONENTIAL'; // default FIXED
    retryableErrors?: string[]; // error message patterns to retry
  };
}
```

**Implementation**: Wrap individual record processing in a retry loop inside the transform executor. On failure, wait `retryDelayMs * (attempt)` and re-process the same record through the operator chain. After max retries, route to `onRecordError`.

---

## Gap 4: Interactive/Approval Workflow (Human-in-the-Loop)

**What**: Pause pipeline execution at a gate step, wait for human approval, then continue.

**Approach**: Add a new `GATE` step type that persists pending records and pauses the run. A GraphQL mutation resumes execution.

**Files to create:**
- `src/runtime/executors/gate.executor.ts` - Gate step executor
- `src/runtime/orchestration/step-strategies/gate-step.strategy.ts` - Gate strategy for graph executor

**Files to modify:**
- `src/constants/enums.ts` - Add `GATE = 'GATE'` to `StepType` enum
- `shared/types/step.types.ts` - Add GATE to `StepType` union
- `src/sdk/dsl/step-configs.ts` - Add `GateStepConfig` interface
- `src/sdk/dsl/pipeline-builder.ts` - Add `.gate()` method
- `src/runtime/orchestration/step-strategies/step-dispatcher.ts` - Add GATE case
- `src/runtime/orchestration/linear-executor.ts` - Add GATE strategy
- `src/api/resolvers/` - Add `approveGate` mutation
- `src/constants/enums.ts` - Add `PAUSED` to `RunStatus` (already exists: `PAUSED = 'PAUSED'`)

**Config:**
```typescript
interface GateStepConfig {
  /** Type of approval required */
  approvalType: 'MANUAL' | 'THRESHOLD' | 'TIMEOUT';
  /** Auto-approve after this many seconds (for TIMEOUT type) */
  timeoutSeconds?: number;
  /** Auto-approve if error rate below this % (for THRESHOLD type) */
  errorThresholdPercent?: number;
  /** Notification webhook when gate is waiting */
  notifyWebhook?: string;
  /** Notification email */
  notifyEmail?: string;
  /** Preview records to show for approval (default 10) */
  previewCount?: number;
}
```

**Flow:**
1. Pipeline reaches GATE step
2. Records are persisted to a `data_hub_gate_queue` table (run_id, step_key, records JSON, status)
3. Run status becomes `PAUSED`
4. Notification sent (webhook/email) with preview of records
5. Admin calls `approveGate(runId, stepKey)` mutation
6. Pipeline resumes from the GATE step with the persisted records
7. Or `rejectGate(runId, stepKey)` to cancel

---

## Gap 5: Streaming Real-Time CDC (Change Data Capture)

**What**: New extractor that reads database changelog/binlog and streams changes as records.

**Approach**: Add a new CDC extractor following the existing extractor pattern. Uses polling-based approach (not true binlog) for portability - queries database for changes since last checkpoint using a timestamp/version column.

**Files to create:**
- `src/extractors/cdc/cdc.extractor.ts` - CDC extractor implementation
- `src/extractors/cdc/types.ts` - CDC config types
- `src/extractors/cdc/index.ts` - Barrel export

**Files to modify:**
- `src/extractors/extractor-registry.service.ts` - Register CDC extractor
- `src/sdk/dsl/step-configs.ts` - Add CDC to `ExtractStepConfig` (already supports `[key: string]: unknown`)
- `src/constants/enums.ts` - No change needed (extractor codes are string-based)
- `shared/types/pipeline.types.ts` - Add `'CDC'` to `SourceType` union

**Config:**
```typescript
interface CdcExtractorConfig {
  adapterCode: 'cdc';
  databaseType: 'POSTGRESQL' | 'MYSQL';
  connectionCode: string;
  table: string;
  trackingColumn: string;       // e.g., 'updated_at' or 'version'
  trackingType: 'TIMESTAMP' | 'VERSION';
  primaryKey: string;           // e.g., 'id'
  columns?: string[];           // specific columns to extract (default: all)
  pollIntervalMs?: number;      // polling interval (default: 5000)
  batchSize?: number;           // records per poll (default: 1000)
  includeDeletes?: boolean;     // track soft deletes (default: false)
  deleteColumn?: string;        // e.g., 'deleted_at'
}
```

**Implementation**: Uses checkpoint system (already in `PipelineContext.checkpointing`) to store last-seen tracking value. On each poll:
1. Query `SELECT * FROM table WHERE tracking_column > last_value ORDER BY tracking_column LIMIT batchSize`
2. Emit records with metadata: `{ _cdc_operation: 'INSERT' | 'UPDATE' | 'DELETE', _cdc_timestamp: ... }`
3. Update checkpoint with latest tracking value
4. If `includeDeletes`, also check `DELETE` column for soft deletes

---

## Gap 6: GraphQL Mutations as Load Target

**What**: New loader handler that sends records as GraphQL mutations to external APIs.

**Approach**: New handler in `src/runtime/executors/loaders/` following `rest-post-handler.ts` pattern.

**Files to create:**
- `src/runtime/executors/loaders/graphql-mutation-handler.ts` - GraphQL mutation loader

**Files to modify:**
- `src/runtime/executors/loaders/index.ts` - Export new handler
- `src/runtime/executors/load.executor.ts` - Register in handler map + DI
- `src/constants/index.ts` - Add `GRAPHQL_MUTATION` to `LOADER_CODE`
- `src/sdk/dsl/step-configs.ts` - Add GraphQL-specific fields to `LoadStepConfig` (already has `[key: string]: unknown`)
- `src/runtime/data-hub-runtime.module.ts` - Add to providers

**Config (uses existing LoadStepConfig + custom fields):**
```typescript
// In LoadStepConfig, these fields are used when adapterCode = 'graphqlMutation':
{
  adapterCode: 'graphqlMutation',
  endpoint: 'https://api.example.com/graphql',
  mutation: 'mutation CreateProduct($input: ProductInput!) { createProduct(input: $input) { id } }',
  variableMapping?: Record<string, string>,  // record field -> GraphQL variable path
  headers?: Record<string, string>,
  auth?: AuthType,
  bearerTokenSecretCode?: string,
  batchMode?: 'single' | 'batch',
  maxBatchSize?: number,
  retries?: number,
  timeoutMs?: number,
}
```

**Implementation**: Similar to RestPostHandler but constructs GraphQL request body:
```json
{ "query": "mutation ...", "variables": { ...mapped from record... } }
```

---

## Gap 7: Custom Operator Plugins

**What**: Allow users to register custom operators at runtime via the SDK.

**Approach**: The infrastructure exists (`DataHubRegistryService.registerRuntime()` supports OPERATOR type). Need to wire the operator execution path to check the registry.

**Files to modify:**
- `src/operators/operator-runtime-registry.ts` - Add `registerCustomOperator()` function that delegates to registry
- `src/runtime/executors/transform.executor.ts` - When operator code not found in built-in registry, check `DataHubRegistryService` for custom operators
- `src/sdk/registry.service.ts` - Already supports OPERATOR type
- `src/sdk/types/index.ts` - Already has `OperatorAdapter` interface with `apply()` method

**SDK usage:**
```typescript
import { DataHubRegistryService } from '@vendure/data-hub/sdk';

// In a Vendure plugin's onModuleInit():
registry.registerRuntime({
  type: 'OPERATOR',
  code: 'myCustomOp',
  name: 'My Custom Operator',
  description: 'Does something custom',
  category: 'CUSTOM',
  schema: { /* JSON schema for config */ },
  async apply(records, config, helpers) {
    // Custom logic
    return { records: records.map(r => ({ ...r, customField: 'value' })) };
  },
});
```

**Key change**: In `transform.executor.ts`, when looking up an operator by code, if not found in `OPERATOR_REGISTRY`, fall back to `DataHubRegistryService.getRuntime('OPERATOR', code)`.

---

## Gap 8: File Transformation (Image Resize, PDF Generation)

**What**: New operators for transforming files referenced in records (image resize, format conversion, PDF generation from templates).

**Approach**: Add new operators in a new `src/operators/file/` category. These operators work on URL/path fields in records, download, transform, and re-upload.

**Files to create:**
- `src/operators/file/index.ts` - Barrel export
- `src/operators/file/image-resize.operator.ts` - Image resize operator
- `src/operators/file/image-convert.operator.ts` - Image format conversion
- `src/operators/file/pdf-generate.operator.ts` - PDF from template

**Files to modify:**
- `src/operators/operator-runtime-registry.ts` - Register file operators
- `src/sdk/dsl/transform-builder.ts` - Add `operators.imageResize()`, `operators.imageConvert()`, `operators.pdfGenerate()` DSL methods
- `src/sdk/constants.ts` - Add to `TRANSFORM_OPERATOR`

**Configs:**
```typescript
// Image Resize
interface ImageResizeConfig {
  sourceField: string;      // Field containing image URL/path
  targetField?: string;     // Output field (default: overwrites source)
  width?: number;
  height?: number;
  fit: 'COVER' | 'CONTAIN' | 'FILL' | 'INSIDE' | 'OUTSIDE';
  format?: 'jpeg' | 'png' | 'webp' | 'avif';
  quality?: number;         // 1-100
}

// Image Convert
interface ImageConvertConfig {
  sourceField: string;
  targetField?: string;
  format: 'jpeg' | 'png' | 'webp' | 'avif' | 'gif';
  quality?: number;
}

// PDF Generate
interface PdfGenerateConfig {
  templateField?: string;    // Field containing HTML template
  template?: string;         // Static HTML template with {{field}} placeholders
  targetField: string;       // Output field for generated PDF path/buffer
  pageSize?: 'A4' | 'LETTER' | 'A3';
  orientation?: 'PORTRAIT' | 'LANDSCAPE';
  margins?: { top?: number; right?: number; bottom?: number; left?: number };
}
```

**Dependencies**: Uses `sharp` for image operations (commonly available in Node.js). PDF uses `puppeteer` or a lighter library like `pdf-lib` + `handlebars`. Since these are heavy deps, they should be optional peer dependencies.

**Note**: Image operators download the file from the URL in `sourceField`, process it, then store the result as a base64 data URI or upload to the configured destination (S3/local). The output field contains the new URL/path.

---

## Implementation Order

Execute in dependency order, committing after each gap:

1. **Gap 7** (Custom Operator Plugins) - Unlocks extensibility, minimal changes
2. **Gap 2** (Parallel Execution DSL) - Already working, just DSL exposure
3. **Gap 6** (GraphQL Mutations Loader) - Standalone new handler
4. **Gap 1** (Multi-Source Join) - New operator, uses operator pattern
5. **Gap 3** (Per-Record Retry) - Modify transform executor
6. **Gap 5** (CDC Extractor) - New extractor, standalone
7. **Gap 8** (File Transformation) - New operators, optional deps
8. **Gap 4** (Interactive/GATE) - Most complex, new step type + persistence + API

## Verification

After each gap:
1. `tsc --noEmit` - TypeScript compilation
2. `vitest run` - All 16+ tests pass
3. `npm run build:dev` - Full build succeeds

After all gaps:
4. Manual smoke test via DSL: create pipeline using each new feature
5. Verify SDK exports are accessible from `@vendure/data-hub/sdk`
