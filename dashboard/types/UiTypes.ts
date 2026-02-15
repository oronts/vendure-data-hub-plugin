import type {
    StepType,
    PipelineTrigger,
    PipelineDefinition,
    AdapterSchema,
} from '../../shared/types';
import type { ConnectionAuthType } from '../../sdk/types/connection-types';
import type {
    DataHubPipeline,
    DataHubAdapter,
    DataHubValidationIssue,
    DataHubValidationResult,
    DataHubDryRunResult,
    DataHubPipelineRun,
} from '../gql/graphql';
import type {
    UINodeStatus,
    PipelineNode,
    PipelineNodeData,
    VisualPipelineDefinition,
} from './Pipeline';
import type { FileType } from '../utils';

export type {
    UINodeStatus,
    PipelineNodeData,
    PipelineNode,
    VisualPipelineDefinition,
    VisualNodeCategory,
    PipelineNodeType,
} from './Pipeline';

export type { FileType };

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

interface AdaptersByCategory {
    category: string;
    label: string;
    adapters: DataHubAdapter[];
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
    | 'HTTP'
    | 'POSTGRES'
    | 'MYSQL'
    | 'S3'
    | 'FTP'
    | 'SFTP';

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

export interface PipelineStep {
    type: string;
    config?: {
        type?: string;
        requireIdempotencyKey?: boolean;
        signature?: string;
        headerName?: string;
        [key: string]: unknown;
    };
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

// TEMPLATE TYPES (canonical source: shared/types/template.types.ts)
export type { TemplateCategory, TemplateDifficulty } from '../../shared/types';
