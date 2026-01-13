# Dashboard Production-Ready Rewrite Design

**Date:** 2026-01-13
**Status:** Approved
**Scope:** Full rewrite of DataHub dashboard for production readiness

## Overview

Complete rewrite of the DataHub dashboard to eliminate type duplication, centralize shared components, use GraphQL generated types as single source of truth, and add production-ready features (loading states, error handling, accessibility).

## Goals

1. **DRY** - Extract shared step/trigger configuration into reusable components
2. **Type Safety** - Use GraphQL generated types (`dashboard/gql/graphql.ts`) as canonical source
3. **Both Editors** - Keep simple form editor and visual workflow editor, sharing components
4. **Production Ready** - Loading states, error boundaries, accessibility, performance

## Type Architecture

### Hierarchy

```
dashboard/gql/graphql.ts     (auto-generated from GraphQL schema)
      ↓ imports
dashboard/types/index.ts     (re-exports + UI-specific extensions)
      ↓ imports
All components              (single import source)
```

### Type Categories

| Category | Source | Used For |
|----------|--------|----------|
| GraphQL Types | `dashboard/gql/graphql.ts` | `DataHubPipeline`, `DataHubPipelineRun`, `DataHubAdapter`, all API types |
| Shared Types | `shared/types/` | `StepType`, `TriggerType`, `FilterCondition`, business logic |
| UI Types | `dashboard/types/ui.types.ts` | Component props, form state, ReactFlow extensions |

### Key Principle

No type definitions inside components. All imports from `dashboard/types`.

## Component Architecture

### Directory Structure

```
dashboard/components/
├── shared/                          # Reusable across all features
│   ├── step-config/                 # Step configuration components
│   │   ├── StepConfigForm.tsx       # Universal step config renderer
│   │   ├── AdapterSelector.tsx      # Adapter dropdown with search
│   │   ├── OperatorConfigEditor.tsx # Transform operator config
│   │   └── index.ts
│   ├── trigger-config/              # Trigger configuration
│   │   ├── TriggerForm.tsx          # Schedule/webhook/event config
│   │   ├── CronBuilder.tsx          # Visual cron expression builder
│   │   └── index.ts
│   ├── schema-form/                 # Dynamic form rendering
│   │   ├── SchemaFormRenderer.tsx   # Renders adapter schemas
│   │   ├── FieldRenderer.tsx        # Individual field types
│   │   └── index.ts
│   └── feedback/                    # Loading, errors, empty states
│       ├── LoadingState.tsx
│       ├── ErrorBoundary.tsx
│       └── EmptyState.tsx
├── pipelines/
│   ├── simple-editor/               # Form-based editor (uses shared/)
│   ├── visual-editor/               # ReactFlow editor (uses shared/)
│   └── common/                      # Pipeline-specific shared
└── wizards/                         # Import/Export wizards
```

### Key Shared Components

| Component | Purpose | Used By |
|-----------|---------|---------|
| `StepConfigForm` | Configure any pipeline step | Both editors |
| `TriggerForm` | Configure triggers | Both editors |
| `AdapterSelector` | Pick adapter with search/filter | Both editors, wizards |
| `SchemaFormRenderer` | Render dynamic forms from schema | All config forms |

## Unified Step Configuration

### Interface

```tsx
interface StepConfigFormProps {
  stepType: StepType;
  adapterCode?: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  onAdapterChange?: (code: string) => void;
  mode?: 'simple' | 'advanced';
  showTester?: boolean;
}
```

### Features

- Adapter selector with category filtering and search
- Dynamic schema form from `DataHubAdapter.schema`
- Real-time validation using adapter schema rules
- Secret reference dropdowns for `{{secret:name}}` fields
- Connection reference dropdowns
- Collapsible step tester for dry-run
- Simple/advanced mode toggle

## Data Flow

### Hook Structure

```
dashboard/hooks/
├── api/                             # GraphQL operations
│   ├── usePipelines.ts              # CRUD for pipelines
│   ├── usePipelineRuns.ts           # Run history & status
│   ├── useAdapters.ts               # Adapter catalog
│   ├── useSecrets.ts                # Secret management
│   ├── useConnections.ts            # Connection management
│   └── index.ts
├── ui/                              # UI state hooks
│   ├── useStepConfig.ts             # Step editing state
│   ├── usePipelineCanvas.ts         # Visual editor state
│   └── index.ts
└── index.ts
```

### Patterns

- All hooks use React Query for caching and background refetch
- Consistent loading/error states via hook returns
- Optimistic updates for better UX
- Automatic cache invalidation on related mutations

## File Cleanup

### Files to DELETE

- `dashboard/types/pipeline.ts` - replaced by GraphQL types
- `dashboard/types/wizard.ts` - replaced by GraphQL types
- `dashboard/components/pipelines/pipeline-canvas/types.ts` - consolidated
- All inline type definitions in component files
- Duplicated validation logic

### Files to HEAVILY REFACTOR

| File | Current Lines | Target Lines |
|------|---------------|--------------|
| `pipeline-editor.tsx` | 1737 | ~400 |
| `reactflow-pipeline-editor.tsx` | 816 | ~300 |
| `NodePropertiesPanel.tsx` | 1057 | ~200 |
| `step-config-panel.tsx` | 780 | ~150 |
| `trigger-config.tsx` | 1083 | ~250 |

## Production Readiness

### Loading & Feedback

- Skeleton loaders for all data tables and forms
- Toast notifications for all mutations
- Progress indicators for long operations
- Empty states with actionable CTAs

### Error Handling

- Error boundaries around each route section
- Retry buttons with exponential backoff
- Graceful degradation with cached data
- Inline form validation errors

### Performance

- Lazy load ReactFlow visual editor
- Virtualized lists for large catalogs
- Debounced search inputs
- Memoized expensive computations

### Accessibility

- Keyboard navigation for node palette
- ARIA labels on interactive elements
- Focus management in modals/drawers

### Extensibility

- Custom adapter registration via plugin options
- Themeable step colors/icons via constants
- Hook points for custom validation rules

## Implementation Order

1. **Phase 1: Types** - Create `dashboard/types/` structure, delete duplicates
2. **Phase 2: Hooks** - Create `dashboard/hooks/api/` with React Query
3. **Phase 3: Shared Components** - Build `components/shared/` foundation
4. **Phase 4: Simple Editor** - Rewrite using shared components
5. **Phase 5: Visual Editor** - Rewrite using shared components
6. **Phase 6: Wizards** - Update to use shared components
7. **Phase 7: Polish** - Loading states, error handling, accessibility

## Success Criteria

- [ ] Zero type definitions inside component files
- [ ] Both editors use identical `StepConfigForm`
- [ ] All data fetching via hooks in `hooks/api/`
- [ ] Every loading state has skeleton/spinner
- [ ] Every mutation shows toast feedback
- [ ] TypeScript strict mode passes
- [ ] No `any` types except in GraphQL generated code
