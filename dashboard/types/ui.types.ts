import type { Edge } from '@xyflow/react';
import type {
    StepType,
    TriggerType,
    PipelineTrigger,
    PipelineDefinition,
    PipelineStepDefinition,
    PipelineContext,
    AdapterSchema,
    TransformationType,
    FilterCondition,
    FormulaField,
    JsonObject,
    AggregationFunction,
} from '../../shared/types';
import type { ConnectionAuthType } from '../../sdk/types/connection-types';
import type {
    DataHubPipeline,
    DataHubAdapter,
    DataHubVendureEntitySchema,
    DataHubValidationIssue,
    DataHubValidationResult,
    DataHubDryRunResult,
    DataHubPipelineRun,
    DataHubStepProgress,
} from '../gql/graphql';
import type {
    UINodeStatus,
    PipelineNode,
    PipelineNodeData,
    VisualPipelineDefinition,
} from './pipeline';
import type { UIFieldMapping } from '../hooks';
import type { FileType } from '../utils';

export type {
    UINodeStatus,
    PipelineNodeData,
    PipelineNode,
    VisualPipelineDefinition,
    VisualNodeCategory,
    PipelineNodeType,
} from './pipeline';

export type VisualEdge = Edge;

export type { FileType };

export interface StepFormState {
    key: string;
    type: StepType;
    adapterCode?: string;
    label?: string;
    config: Record<string, unknown>;
    isValid: boolean;
    errors: Record<string, string>;
    isDirty: boolean;
}

export interface PipelineFormState {
    name: string;
    code: string;
    description?: string;
    enabled: boolean;
    steps: StepFormState[];
    triggers: PipelineTrigger[];
    isDirty: boolean;
    isValid: boolean;
}

export interface TriggerFormState {
    type: TriggerType;
    enabled: boolean;
    config: Record<string, unknown>;
    isValid: boolean;
    errors: Record<string, string>;
}

export interface AdapterSelectorProps {
    stepType: StepType;
    value?: string;
    onChange: (code: string) => void;
    placeholder?: string;
    disabled?: boolean;
    adapters?: DataHubAdapter[];
}

export interface TriggerFormProps {
    trigger: PipelineTrigger;
    onChange: (trigger: PipelineTrigger) => void;
    onRemove?: () => void;
    readOnly?: boolean;
    secretCodes?: string[];
    compact?: boolean;
}

export interface SchemaFormRendererProps {
    schema: AdapterSchema;
    values: Record<string, unknown>;
    onChange: (values: Record<string, unknown>) => void;
    errors?: Record<string, string>;
    readOnly?: boolean;
    hideOptional?: boolean;
    secretCodes?: string[];
    connectionCodes?: string[];
    compact?: boolean;
}

export interface BaseEditorProps {
    onRun?: () => void;
    readOnly?: boolean;
    pipelineId?: string;
}

export interface VisualPipelineEditorProps extends BaseEditorProps {
    definition: VisualPipelineDefinition;
    onChange: (definition: VisualPipelineDefinition) => void;
    onSave?: () => void;
}

export interface SimplePipelineEditorProps extends BaseEditorProps {
    definition?: Record<string, unknown>;
    onChange?: (definition: Record<string, unknown>) => void;
    pipeline?: DataHubPipeline;
    initialDefinition?: Record<string, unknown>;
    onSave?: (definition: Record<string, unknown>) => void;
    onCancel?: () => void;
    isLoading?: boolean;
    isSaving?: boolean;
    issues?: Array<{ message: string; stepKey?: string | null; field?: string | null; reason?: string | null }>;
}

export interface NodePaletteProps {
    adapters?: DataHubAdapter[];
    onDragStart: (event: React.DragEvent, nodeType: string, category: string, label: string) => void;
}

export interface PropertiesPanelProps {
    node: PipelineNode | null;
    adapters?: DataHubAdapter[];
    secretCodes?: string[];
    connectionCodes?: string[];
    onUpdate: (nodeId: string, data: Partial<PipelineNodeData>) => void;
    onDelete: (nodeId: string) => void;
    onClose: () => void;
}

export interface TriggerPanelProps {
    triggers: PipelineTrigger[];
    onChange: (triggers: PipelineTrigger[]) => void;
}

export interface LoadingStateProps {
    type?: 'table' | 'form' | 'card' | 'list' | 'spinner';
    rows?: number;
    message?: string;
    className?: string;
}

export interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: {
        label: string;
        onClick: () => void;
    };
    className?: string;
}

export interface ErrorStateProps {
    title?: string;
    message: string;
    onRetry?: () => void;
    error?: Error;
    className?: string;
}

export interface AdaptersByCategory {
    category: string;
    label: string;
    adapters: DataHubAdapter[];
}

export type PipelineRunSummary = Pick<
    DataHubPipelineRun,
    'id' | 'status' | 'startedAt' | 'finishedAt' | 'error' | 'metrics'
>;

export type StepExecutionStatus = Omit<DataHubStepProgress, 'status' | 'runId' | 'recordsFailed'> & {
    status: UINodeStatus;
    errorCount?: number;
};

export interface BaseDialogProps {
    open: boolean;
    onClose: () => void;
}

export interface FieldMappingDialogProps extends BaseDialogProps {
    sourceFields: string[];
    targetSchema?: DataHubVendureEntitySchema;
    mappings: Record<string, string>;
    onSave: (mappings: Record<string, string>) => void;
}

export interface FileUploadDialogProps extends BaseDialogProps {
    onFileSelected: (file: File, preview: JsonObject[]) => void;
    acceptedFormats: string[];
    maxSize?: number;
}

export interface ConfirmDialogProps extends BaseDialogProps {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
}

export type ValidationIssue = DataHubValidationIssue;

export interface ValidationState {
    isValid: boolean | null;
    count: number;
    issues: ValidationIssue[];
    warnings: ValidationIssue[];
}

export interface StatCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: React.ReactNode;
    trend?: {
        value: number;
        direction: 'up' | 'down' | 'neutral';
        label?: string;
    };
    variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
    isLoading?: boolean;
    onClick?: () => void;
    className?: string;
}

export type UIConnectionType =
    | 'http'
    | 'postgres'
    | 'mysql'
    | 's3'
    | 'ftp'
    | 'sftp';

export interface HttpConnectionConfig {
    baseUrl: string;
    timeout?: number;
    headers?: Record<string, string>;
    auth?: {
        type: ConnectionAuthType;
        headerName?: string;
        secretCode?: string;
        username?: string;
        usernameSecretCode?: string;
    };
}

export interface RunMetrics {
    total: number;
    successful: number;
    failed: number;
    pending: number;
    cancelled: number;
    avgDuration: number;
    totalRecords: number;
    errorRate: number;
}

export interface TimeSeriesPoint {
    timestamp: string;
    value: number;
    label?: string;
}

export interface PipelineStats {
    pipelineId: string;
    pipelineName: string;
    runCount: number;
    successRate: number;
    avgDuration: number;
    lastRun?: string;
    trend: 'up' | 'down' | 'stable';
}

export interface AnalyticsDashboardProps {
    metrics?: RunMetrics;
    runsByDay?: TimeSeriesPoint[];
    runsByPipeline?: PipelineStats[];
    errorsByType?: Array<{ type: string; count: number }>;
    recentErrors?: Array<{
        id: string;
        message: string;
        pipeline: string;
        timestamp: string;
    }>;
    loading?: boolean;
    onRefresh?: () => void;
    onTimeRangeChange?: (range: string) => void;
}

export interface AggregateConfig {
    groupBy: string[];
    aggregations: Array<{
        field: string;
        function: AggregationFunction;
        alias: string;
    }>;
}

export interface TypeCast {
    field: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'array';
}

export type TransformStepConfig = Record<string, unknown>;

export interface UITransformStep {
    id: string;
    type: TransformationType;
    name: string;
    enabled: boolean;
    config: Record<string, unknown>;
}

export interface TransformationToolkitProps {
    steps: UITransformStep[];
    onChange: (steps: UITransformStep[]) => void;
    availableFields?: string[];
    onPreview?: (step: UITransformStep) => void;
}

export interface MapConfigProps {
    config: { mappings: UIFieldMapping[] };
    onChange: (config: Record<string, unknown>) => void;
    fields: string[];
}

export interface FilterConfigProps {
    config: { conditions: FilterCondition[]; logic: 'AND' | 'OR' };
    onChange: (config: Record<string, unknown>) => void;
    fields: string[];
}

export interface FormulaConfigProps {
    config: { formulas: FormulaField[] };
    onChange: (config: Record<string, unknown>) => void;
    fields: string[];
}

export interface AggregateConfigProps {
    config: AggregateConfig;
    onChange: (config: Record<string, unknown>) => void;
    fields: string[];
}

export interface StepEditorProps {
    step: UITransformStep;
    onChange: (step: UITransformStep) => void;
    fields: string[];
}

export type DryRunResult = DataHubDryRunResult;

export interface DryRunMetrics {
    recordsProcessed?: number;
    recordsSucceeded?: number;
    recordsFailed?: number;
    recordsSkipped?: number;
    durationMs?: number;
    stepsExecuted?: number;
    details?: Array<{
        stepKey: string;
        adapterCode?: string;
        recordsIn?: number;
        recordsOut?: number;
        durationMs?: number;
    }>;
}

export type PipelineValidationResult = DataHubValidationResult;

/**
 * Props for the PipelineEditor component (simple list-based editor)
 */
export interface PipelineEditorProps {
    readonly definition: PipelineDefinition;
    readonly onChange: (definition: PipelineDefinition) => void;
    readonly issues?: ValidationIssue[];
}

/**
 * Types for pipeline detail page
 */
export type PipelineEntity = Pick<
    DataHubPipeline,
    'id' | 'code' | 'name' | 'enabled' | 'status' | 'version' | 'publishedAt' | 'definition'
>;

export interface PipelineStepConfig {
    type?: string;
    requireIdempotencyKey?: boolean;
    signature?: string;
    headerName?: string;
    [key: string]: unknown;
}

export interface PipelineStep {
    type: string;
    config?: PipelineStepConfig;
    [key: string]: unknown;
}

export interface PipelineFormControl {
    watch: (name: string) => unknown;
    setValue: (name: string, value: unknown, options?: { shouldDirty?: boolean }) => void;
    getValues: (name: string) => unknown;
}

/**
 * Types for pipeline runs
 */
export interface IndividualRunMetrics extends Record<string, unknown> {
    processed?: number;
    succeeded?: number;
    failed?: number;
    durationMs?: number;
    details?: StepMetricsDetail[];
}

export interface StepMetricsDetail extends Record<string, unknown> {
    stepKey?: string;
    type?: string;
    adapterCode?: string;
    ok?: number;
    fail?: number;
    durationMs?: number;
    counters?: Record<string, number>;
}

export type RunRow = Pick<DataHubPipelineRun, 'id' | 'status' | 'startedAt' | 'finishedAt'> & {
    metrics?: IndividualRunMetrics;
};

export interface RunDetailsPanelProps {
    runId: string;
    initialData: RunRow;
    onCancel: (id: string) => void;
    onRerun: (pipelineId: string) => void;
    isCancelling: boolean;
}

export interface RunErrorsListProps {
    runId: string;
    items: Array<{ id: string; stepKey: string; message: string; payload: unknown }>;
    onRetry: (errorId: string, patch: Record<string, unknown>) => Promise<void>;
}

/** Props for ValidationErrorDisplay component (feedback/) */
export interface ValidationErrorDisplayProps {
    errors: Record<string, string>;
    show?: boolean;
    title?: string;
    className?: string;
}

/**
 * Props for EntitySelector component (entity-selector/)
 */
export interface EntitySelectorProps {
    value: string | undefined;
    onChange: (entityCode: string) => void;
    className?: string;
}

/**
 * Props for SelectableCard component (selectable-card/)
 */
export interface SelectableCardProps {
    icon?: React.FC<{ className?: string }>;
    title: string;
    description?: string;
    badge?: string | number;
    selected: boolean;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
}

/**
 * Props for SelectableCardGrid component (selectable-card/)
 */
export interface SelectableCardGridProps {
    children: React.ReactNode;
    columns?: 2 | 3 | 4;
    className?: string;
}

/**
 * Props for FileDropzone component (file-dropzone/)
 */
export interface FileDropzoneProps {
    onFileSelect: (file: File) => void;
    allowedTypes?: FileType[];
    accept?: string;
    loading?: boolean;
    loadingMessage?: string;
    selectedFile?: File | null;
    onClear?: () => void;
    showFileIcons?: boolean;
    compact?: boolean;
    className?: string;
}

/**
 * Props for SummaryCard component (wizard/)
 */
export interface SummaryCardProps {
    icon: React.FC<{ className?: string }>;
    label: string;
    value: React.ReactNode;
    className?: string;
}

/**
 * Props for SummaryCardGrid component (wizard/)
 */
export interface SummaryCardGridProps {
    children: React.ReactNode;
    columns?: 2 | 3 | 4;
    className?: string;
}

/**
 * Props for WizardProgressBar component (wizard/)
 */
export interface WizardProgressBarProps {
    steps: Array<{
        id: string;
        label: string;
        icon: React.FC<{ className?: string }>;
    }>;
    currentStep: number;
    onStepClick: (step: number) => void;
}

/**
 * Props for WizardFooter component (wizard/)
 */
export interface WizardFooterProps {
    currentStep: number;
    totalSteps: number;
    canProceed: boolean;
    onBack: () => void;
    onNext: () => void;
    onComplete: () => void;
    onCancel: () => void;
    completeLabel?: string;
    completeIcon?: React.FC<{ className?: string }>;
}

/**
 * Props for ConfigurationNameCard component (wizard/)
 */
export interface ConfigurationNameCardProps {
    title: string;
    name: string;
    description: string;
    onNameChange: (name: string) => void;
    onDescriptionChange: (description: string) => void;
    namePlaceholder?: string;
    nameError?: string;
    nameHelperText?: string;
}

/**
 * Props for TriggerSelector component (wizard-trigger/)
 */
export interface TriggerSelectorProps {
    options: readonly Array<{ id: string; label: string; desc?: string }>;
    value: string;
    onChange: (type: string) => void;
    columns?: 2 | 3 | 4;
}

/**
 * Props for ScheduleConfig component (wizard-trigger/)
 */
export interface ScheduleConfigProps {
    cron: string;
    onChange: (cron: string) => void;
    showCard?: boolean;
}

/**
 * Props for WebhookConfig component (wizard-trigger/)
 */
export interface WebhookConfigProps {
    webhookPath: string;
    onChange: (path: string) => void;
    showCard?: boolean;
}

/**
 * Props for FieldError component (validation-feedback)
 */
export interface FieldErrorProps {
    error?: string | null;
    touched?: boolean;
    showImmediately?: boolean;
    className?: string;
}

/**
 * Props for FieldSelector component (field-selector/)
 */
export interface FieldSelectorProps {
    value: string;
    onChange: (value: string) => void;
    fields: string[];
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    allowEmpty?: boolean;
    emptyLabel?: string;
}

/**
 * Chart component types
 */
export interface BarChartDataPoint {
    label: string;
    value: number;
    color?: string;
}

export interface SimpleBarChartProps {
    data: BarChartDataPoint[];
    height?: number;
    showLabels?: boolean;
    className?: string;
}

export interface DonutChartDataPoint {
    label: string;
    value: number;
    color: string;
}

export interface SimpleDonutChartProps {
    data: DonutChartDataPoint[];
    size?: number;
    thickness?: number;
    showLegend?: boolean;
    className?: string;
}

/**
 * Props for TriggersPanel component (triggers-panel/)
 * Supports two modes: explicit handlers or onChange callback
 */
export interface TriggersPanelExplicitProps {
    triggers: PipelineTrigger[];
    addTrigger: () => void;
    updateTrigger: (index: number, trigger: PipelineTrigger) => void;
    removeTrigger: (index: number) => void;
    onChange?: never;
    readOnly?: boolean;
    secretCodes?: string[];
    variant?: 'compact' | 'full';
}

export interface TriggersPanelOnChangeProps {
    triggers: PipelineTrigger[];
    onChange: (triggers: PipelineTrigger[]) => void;
    addTrigger?: never;
    updateTrigger?: never;
    removeTrigger?: never;
    readOnly?: boolean;
    secretCodes?: string[];
    variant?: 'compact' | 'full';
}

export type TriggersPanelProps = TriggersPanelExplicitProps | TriggersPanelOnChangeProps;
