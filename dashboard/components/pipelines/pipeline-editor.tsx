import * as React from 'react';
import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Badge,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Switch,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Label,
    
} from '@vendure/dashboard';
import {
    Plus,
    Trash2,
    ChevronUp,
    ChevronDown,
    Play,
    Download,
    RefreshCw,
    CheckCircle,
    Sparkles,
    GitBranch,
    Upload,
    FileOutput,
    Rss,
    Search,
    Settings,
    Clock,
    AlertTriangle,
    Zap,
    Calendar,
    Webhook,
    Bell,
} from 'lucide-react';
import { SchemaFormRenderer, FormSchemaField as SchemaField } from '../common';
import { OperatorCheatSheetButton } from './shared/operator-cheatsheet';
import { StepTester } from './shared/step-tester';
import { AdvancedMapEditor, AdvancedTemplateEditor, AdvancedWhenEditor, MultiOperatorEditor } from './shared/advanced-editors';
import { STEP_CONFIGS, StepType, VENDURE_EVENTS, VENDURE_EVENTS_BY_CATEGORY } from '../../constants/index';
import { getAdapterType, stepRequiresAdapter, getAdapterTypeLabel, validateStepConfig } from '../../utils/index';
import { useAdapterCatalog, AdapterMetadata } from '../../hooks/index';

// TYPES

interface PipelineStep {
    key: string;
    type: StepType;
    name?: string;
    config: Record<string, unknown>;
    async?: boolean;
    throughput?: {
        batchSize?: number;
        rateLimitRps?: number;
    };
}

interface TriggerConfig {
    type: 'manual' | 'schedule' | 'webhook' | 'event' | 'file';
    enabled?: boolean;
    cron?: string;
    timezone?: string;
    webhookCode?: string;
    webhookPath?: string;
    eventType?: string;
    fileWatch?: { connectionCode: string; path: string; pattern?: string };
}

interface ErrorHandlingConfig {
    maxRetries?: number;
    retryDelayMs?: number;
    maxRetryDelayMs?: number;
    backoffMultiplier?: number;
    deadLetterQueue?: boolean;
    alertOnDeadLetter?: boolean;
    errorThresholdPercent?: number;
}

interface CheckpointingConfig {
    enabled?: boolean;
    strategy?: 'count' | 'timestamp' | 'interval';
    intervalRecords?: number;
    intervalMs?: number;
    field?: string;
}

interface ThroughputConfig {
    batchSize?: number;
    rateLimitRps?: number;
    concurrency?: number;
}

interface PipelineContext {
    runMode?: 'sync' | 'async' | 'batch' | 'stream';
    throughput?: ThroughputConfig;
    errorHandling?: ErrorHandlingConfig;
    checkpointing?: CheckpointingConfig;
}

interface PipelineDefinition {
    version: number;
    steps: PipelineStep[];
    edges?: Array<{ from: string; to: string; branch?: string }>;
    context?: PipelineContext;
    capabilities?: Record<string, unknown>;
    trigger?: TriggerConfig;
    triggers?: TriggerConfig[];
}

interface PipelineEditorProps {
    readonly definition: PipelineDefinition;
    readonly onChange: (definition: PipelineDefinition) => void;
    readonly issues?: Array<{ message: string; stepKey?: string | null; field?: string | null; reason?: string | null }>;
}

// STEP ICONS

const STEP_ICONS: Record<StepType, React.ComponentType<{ className?: string }>> = {
    TRIGGER: Play,
    EXTRACT: Download,
    TRANSFORM: RefreshCw,
    VALIDATE: CheckCircle,
    ENRICH: Sparkles,
    ROUTE: GitBranch,
    LOAD: Upload,
    EXPORT: FileOutput,
    FEED: Rss,
    SINK: Search,
};

// MAIN COMPONENT

export function PipelineEditor({ definition, onChange, issues = [] }: PipelineEditorProps) {
    const [selectedStepIndex, setSelectedStepIndex] = React.useState<number | null>(null);
    const [activePanel, setActivePanel] = React.useState<'steps' | 'settings' | 'triggers'>('steps');

    // Fetch adapters, connections, and secrets via unified hook
    const { adapters, connectionCodes, secretOptions, isLoading } = useAdapterCatalog();

    const steps = definition.steps ?? [];

    const addStep = (type: StepType) => {
        // Initialize with sensible defaults based on step type
        const defaultConfig: Record<string, unknown> = {};

        // Set step-specific defaults
        switch (type) {
            case 'TRIGGER':
                defaultConfig.type = 'manual';
                defaultConfig.enabled = true;
                break;
            case 'VALIDATE':
                defaultConfig.mode = 'fail-fast';
                break;
            case 'ROUTE':
                defaultConfig.branches = [];
                break;
            default:
                // For steps that require adapters, config will be populated when adapter is selected
                break;
        }

        const newStep: PipelineStep = {
            key: `${type.toLowerCase()}-${Date.now()}`,
            type,
            config: defaultConfig,
        };

        // Get existing edges
        const existingEdges = definition.edges ?? [];

        // If the pipeline has edges (DAG mode), connect the new step to maintain graph connectivity
        // This prevents the "Graph must have exactly one root" error when adding steps
        let newEdges = existingEdges;
        if (existingEdges.length > 0 && steps.length > 0) {
            // Find the last step in the current pipeline to connect from
            // For simplicity, connect from the last step in the array
            const lastStep = steps[steps.length - 1];
            if (lastStep) {
                newEdges = [
                    ...existingEdges,
                    { from: lastStep.key, to: newStep.key },
                ];
            }
        }

        onChange({
            ...definition,
            steps: [...steps, newStep],
            edges: newEdges,
        });
        setSelectedStepIndex(steps.length);
    };

    const updateStep = (index: number, updatedStep: PipelineStep) => {
        const newSteps = [...steps];
        newSteps[index] = updatedStep;
        onChange({ ...definition, steps: newSteps });
    };

    const removeStep = (index: number) => {
        const stepToRemove = steps[index];
        const stepKey = stepToRemove?.key;
        const newSteps = steps.filter((_, i) => i !== index);

        // Find edges that reference the deleted step
        const existingEdges = definition.edges ?? [];

        // Find incoming edges (edges TO the deleted step)
        const incomingEdges = existingEdges.filter(edge => edge.to === stepKey);
        // Find outgoing edges (edges FROM the deleted step)
        const outgoingEdges = existingEdges.filter(edge => edge.from === stepKey);

        // Remove edges that reference the deleted step
        let newEdges = existingEdges.filter(
            edge => edge.from !== stepKey && edge.to !== stepKey
        );

        // Reconnect the graph: create new edges from each predecessor to each successor
        // This maintains graph connectivity when removing a step in the middle
        // Example: If we have A -> B -> C and remove B, we create A -> C
        if (incomingEdges.length > 0 && outgoingEdges.length > 0) {
            const reconnectionEdges: Array<{ from: string; to: string; branch?: string }> = [];
            for (const inEdge of incomingEdges) {
                for (const outEdge of outgoingEdges) {
                    // Check if this edge already exists to avoid duplicates
                    const edgeExists = newEdges.some(
                        e => e.from === inEdge.from && e.to === outEdge.to
                    );
                    if (!edgeExists) {
                        reconnectionEdges.push({
                            from: inEdge.from,
                            to: outEdge.to,
                            // Preserve branch from incoming edge if it exists
                            ...(inEdge.branch ? { branch: inEdge.branch } : {}),
                        });
                    }
                }
            }
            if (reconnectionEdges.length > 0) {
                newEdges = [...newEdges, ...reconnectionEdges];
            }
        }

        onChange({ ...definition, steps: newSteps, edges: newEdges });
        setSelectedStepIndex(null);
    };

    const moveStep = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === steps.length - 1) return;

        const newSteps = [...steps];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
        onChange({ ...definition, steps: newSteps });
        setSelectedStepIndex(targetIndex);
    };

    const updateContext = (context: PipelineContext) => {
        onChange({ ...definition, context });
    };

    const updateTriggers = (triggers: TriggerConfig[]) => {
        onChange({ ...definition, triggers, trigger: triggers[0] });
    };

    const selectedStep = selectedStepIndex !== null ? steps[selectedStepIndex] : null;

    

    return (
        <div className="flex h-full border rounded-lg overflow-hidden bg-background">
            {/* Left Panel: Navigation */}
            <div className="w-80 border-r flex flex-col">
                {/* Panel Tabs */}
                <div className="border-b">
                    <div className="flex">
                        <button
                            type="button"
                            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                activePanel === 'steps'
                                    ? 'bg-primary/10 text-primary border-b-2 border-primary'
                                    : 'text-muted-foreground hover:bg-muted'
                            }`}
                            onClick={() => setActivePanel('steps')}
                        >
                            <Play className="h-3 w-3 inline mr-1" />
                            Steps
                        </button>
                        <button
                            type="button"
                            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                activePanel === 'triggers'
                                    ? 'bg-primary/10 text-primary border-b-2 border-primary'
                                    : 'text-muted-foreground hover:bg-muted'
                            }`}
                            onClick={() => setActivePanel('triggers')}
                        >
                            <Bell className="h-3 w-3 inline mr-1" />
                            Triggers
                        </button>
                        <button
                            type="button"
                            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                activePanel === 'settings'
                                    ? 'bg-primary/10 text-primary border-b-2 border-primary'
                                    : 'text-muted-foreground hover:bg-muted'
                            }`}
                            onClick={() => setActivePanel('settings')}
                        >
                            <Settings className="h-3 w-3 inline mr-1" />
                            Settings
                        </button>
                    </div>
                </div>

                {/* Steps Panel */}
                {activePanel === 'steps' && (
                    <>
                        <div className="p-3 border-b bg-muted/50">
                            <h3 className="font-semibold text-sm">Pipeline Steps</h3>
                            <p className="text-xs text-muted-foreground">Click to configure each step</p>
                        </div>
                        <div className="flex-1 overflow-auto p-2 space-y-1">
                            {steps.map((step, index) => {
                                // Count edges connected to this step
                                const edges = definition.edges ?? [];
                                const connectionCount = edges.filter(
                                    e => e.from === step.key || e.to === step.key
                                ).length;

                                return (
                                    <StepListItem
                                        key={step.key}
                                        step={step}
                                        index={index}
                                        isSelected={selectedStepIndex === index}
                                        onClick={() => setSelectedStepIndex(index)}
                                        onMoveUp={() => moveStep(index, 'up')}
                                        onMoveDown={() => moveStep(index, 'down')}
                                        onRemove={() => removeStep(index)}
                                        isFirst={index === 0}
                                        isLast={index === steps.length - 1}
                                        issueCount={issues.filter(i => i.stepKey === step.key).length}
                                        connectionCount={connectionCount}
                                    />
                                );
                            })}
                            {steps.length === 0 && (
                                <div className="p-4 text-center text-muted-foreground text-sm">
                                    No steps yet. Add a step to get started.
                                </div>
                            )}
                        </div>
                        <div className="p-3 border-t bg-muted/50">
                            <p className="text-xs text-muted-foreground mb-2">Add Step:</p>
                            <div className="grid grid-cols-3 gap-1">
                                {(['TRIGGER', 'EXTRACT', 'TRANSFORM', 'VALIDATE', 'ENRICH', 'LOAD', 'EXPORT', 'FEED', 'SINK'] as StepType[]).map((type) => {
                                    const config = STEP_CONFIGS[type];
                                    const Icon = STEP_ICONS[type];
                                    return (
                                        <Button
                                            key={type}
                                            variant="outline"
                                            size="sm"
                                            className="h-8 text-xs"
                                            onClick={() => addStep(type)}
                                            title={config?.description}
                                        >
                                            <Icon className="h-3 w-3 mr-1" />
                                            {config?.label ?? type}
                                        </Button>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}

                {/* Triggers Panel */}
                {activePanel === 'triggers' && (
                    <TriggersPanel
                        triggers={definition.triggers ?? []}
                        onChange={updateTriggers}
                    />
                )}

                {/* Settings Panel */}
                {activePanel === 'settings' && (
                    <PipelineSettingsPanel
                        context={definition.context ?? {}}
                        onChange={updateContext}
                    />
                )}
            </div>

            {/* Right Panel: Step Configuration */}
            <div className="flex-1 overflow-auto">
                {activePanel === 'steps' && selectedStep ? (
                    <StepConfigEditor
                        step={selectedStep}
                        adapters={adapters}
                        onChange={(updated) => updateStep(selectedStepIndex!, updated)}
                        connectionCodes={connectionCodes}
                        secretOptions={secretOptions}
                    />
                ) : activePanel === 'steps' ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        <div className="text-center">
                            <p className="text-sm">Select a step to configure</p>
                            <p className="text-xs mt-1">or add a new step from the left panel</p>
                        </div>
                    </div>
                ) : activePanel === 'triggers' ? (
                    <div className="p-6">
                        <h3 className="font-semibold mb-4">Trigger Configuration</h3>
                        <p className="text-sm text-muted-foreground">
                            Configure how and when this pipeline runs. You can have multiple triggers -
                            for example, run on a schedule AND allow manual triggering.
                        </p>
                        <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                            <h4 className="text-sm font-medium mb-2">Trigger Types:</h4>
                            <ul className="text-sm text-muted-foreground space-y-1">
                                <li><strong>Manual</strong> - Run from dashboard or API</li>
                                <li><strong>Schedule</strong> - Run on cron schedule</li>
                                <li><strong>Webhook</strong> - Run when webhook is called</li>
                                <li><strong>Event</strong> - Run when Vendure event fires</li>
                                <li><strong>File Watch</strong> - Run when files appear</li>
                            </ul>
                        </div>
                    </div>
                ) : (
                    <div className="p-6">
                        <h3 className="font-semibold mb-4">Pipeline Settings</h3>
                        <p className="text-sm text-muted-foreground">
                            Configure execution behavior including error handling, checkpointing for
                            resumable runs, and throughput controls.
                        </p>
                        <div className="mt-4 space-y-4">
                            <div className="p-4 bg-muted/50 rounded-lg">
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                    Error Handling
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                    Configure retries, backoff, and dead letter queue for failed records.
                                </p>
                            </div>
                            <div className="p-4 bg-muted/50 rounded-lg">
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-blue-500" />
                                    Checkpointing
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                    Enable resumable execution with periodic checkpoints.
                                </p>
                            </div>
                            <div className="p-4 bg-muted/50 rounded-lg">
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-green-500" />
                                    Throughput
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                    Control batch size, concurrency, and rate limiting.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// STEP LIST ITEM

interface StepListItemProps {
    readonly step: PipelineStep;
    readonly index: number;
    readonly isSelected: boolean;
    readonly onClick: () => void;
    readonly onMoveUp: () => void;
    readonly onMoveDown: () => void;
    readonly onRemove: () => void;
    readonly isFirst: boolean;
    readonly isLast: boolean;
    readonly issueCount?: number;
    readonly connectionCount?: number;
}

function StepListItem({
    step,
    index,
    isSelected,
    onClick,
    onMoveUp,
    onMoveDown,
    onRemove,
    isFirst,
    isLast,
    issueCount = 0,
    connectionCount = 0,
}: StepListItemProps) {
    const config = STEP_CONFIGS[step.type];
    const Icon = STEP_ICONS[step.type] ?? Play;

    return (
        <div
            className={`group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted'
            }`}
            onClick={onClick}
        >
            <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs"
                style={{ backgroundColor: config?.color ?? '#666' }}
            >
                <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-xs truncate">{step.key}</span>
                    {issueCount > 0 && (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-800">
                            {issueCount}
                        </span>
                    )}
                    <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0"
                        style={{ color: config?.color }}
                    >
                        {config?.label ?? step.type}
                    </Badge>
                </div>
                {step.config?.adapterCode && (
                    <p className="text-xs text-muted-foreground truncate">
                        {String(step.config.adapterCode)}
                    </p>
                )}
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                    disabled={isFirst}
                >
                    <ChevronUp className="h-3 w-3" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                    disabled={isLast}
                >
                    <ChevronDown className="h-3 w-3" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    title={connectionCount > 0 ? `Delete step (${connectionCount} connection${connectionCount > 1 ? 's' : ''} will be removed)` : 'Delete step'}
                >
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
        </div>
    );
}

// STEP CONFIG EDITOR

interface StepConfigEditorProps {
    readonly step: PipelineStep;
    readonly adapters: AdapterMetadata[];
    readonly onChange: (step: PipelineStep) => void;
    readonly connectionCodes: string[];
    readonly secretOptions: Array<{ code: string; provider?: string }>;
}

function StepConfigEditor({ step, adapters, onChange, connectionCodes, secretOptions }: StepConfigEditorProps) {
    const config = STEP_CONFIGS[step.type];
    const adapterType = getAdapterType(step.type);
    const availableAdapters = adapterType ? adapters.filter((a) => a.type === adapterType) : [];
    const selectedAdapter = availableAdapters.find((a) => a.code === step.config?.adapterCode);

    // Multi-operator transforms use embedded operators instead of a single adapterCode
    const hasMultiOperatorConfig = step.type === 'TRANSFORM' && Array.isArray(step.config?.operators) && step.config.operators.length > 0;
    const needsAdapterSelection = !step.config?.adapterCode && !hasMultiOperatorConfig;

    const updateConfig = (key: string, value: unknown) => {
        onChange({
            ...step,
            config: { ...step.config, [key]: value },
        });
    };

    const updateConfigBatch = (values: Record<string, unknown>) => {
        onChange({
            ...step,
            config: { ...step.config, ...values },
        });
    };

    const dynamicFields: SchemaField[] = React.useMemo(() => {
        const baseFields = selectedAdapter?.schema?.fields ?? [];
        return baseFields.map(f => {
            if (f.key === 'connectionCode') {
                return { ...f, type: 'select', options: connectionCodes.map(code => ({ value: code, label: code })) } as SchemaField;
            }
            if (f.key.endsWith('SecretCode')) {
                return { ...f, type: 'secret' } as SchemaField;
            }
            return f;
        });
    }, [selectedAdapter, connectionCodes]);

    return (
        <div className="p-4 space-y-6">
            {/* Header */}
            <div
                className="p-4 rounded-lg"
                style={{ backgroundColor: config?.bgColor ?? '#f5f5f5' }}
            >
                <div className="flex items-center gap-3">
                    <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white"
                        style={{ backgroundColor: config?.color ?? '#666' }}
                    >
                        {step.type.charAt(0)}
                    </div>
                    <div>
                        <h3 className="font-semibold" style={{ color: config?.color }}>
                            {config?.label ?? step.type} Step
                        </h3>
                        <p className="text-sm text-muted-foreground">{config?.description}</p>
                    </div>
                </div>
            </div>

            {/* Step Key */}
            <div className="space-y-2">
                <label className="text-sm font-medium">Step Key</label>
                <Input
                    value={step.key}
                    onChange={(e) => onChange({ ...step, key: e.target.value })}
                    placeholder="unique-step-key"
                    className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                    Unique identifier for this step in the pipeline
                </p>
            </div>

            {/* Trigger Type (for TRIGGER steps) */}
            {step.type === 'TRIGGER' && (
                <TriggerConfigForm
                    config={step.config}
                    onChange={updateConfigBatch}
                />
            )}

            {/* Adapter Selection (for steps that use adapters) */}
            {adapterType && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                {getAdapterTypeLabel(adapterType)}
                            </label>
                        </div>
                        {adapterType === 'operator' && <OperatorCheatSheetButton />}
                    </div>

                    {/* Warning when no adapters available */}
                    {availableAdapters.length === 0 && (
                        <div className="p-3 bg-muted rounded-md">
                            <p className="text-sm text-muted-foreground">
                                Loading {getAdapterTypeLabel(adapterType).toLowerCase()}s...
                            </p>
                        </div>
                    )}

                    {/* Transform step - always use operator list */}
                    {step.type === 'TRANSFORM' && (
                        <MultiOperatorEditor
                            operators={Array.isArray(step.config?.operators) ? step.config.operators : []}
                            availableOperators={availableAdapters.map(a => ({ code: a.code, name: a.name, description: a.description }))}
                            onChange={(operators) => {
                                onChange({
                                    ...step,
                                    config: { operators },
                                });
                            }}
                        />
                    )}

                    {/* Warning when no adapter selected */}
                    {availableAdapters.length > 0 && needsAdapterSelection && step.type !== 'TRANSFORM' && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                            <div className="flex items-center gap-2 text-amber-800">
                                <AlertTriangle className="h-4 w-4" />
                                <span className="text-sm font-medium">Select a {getAdapterTypeLabel(adapterType).toLowerCase()}</span>
                            </div>
                            <p className="text-xs text-amber-700 mt-1">
                                This step requires a {getAdapterTypeLabel(adapterType).toLowerCase()} to be selected before it can be used.
                            </p>
                        </div>
                    )}

                    {/* Single adapter selector - hide for TRANSFORM steps (they use MultiOperatorEditor) */}
                    {availableAdapters.length > 0 && step.type !== 'TRANSFORM' && (
                        <div className="space-y-2">
                            <Select
                                value={String(step.config?.adapterCode ?? '')}
                                onValueChange={(v) => {
                                    if (v && v !== step.config?.adapterCode) {
                                        updateConfig('adapterCode', v);
                                    }
                                }}
                            >
                                <SelectTrigger className={needsAdapterSelection ? 'border-amber-300' : ''}>
                                    <SelectValue placeholder={`Select ${getAdapterTypeLabel(adapterType).toLowerCase()}...`} />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableAdapters.map((adapter) => {
                                        const Icon = adapter.icon;
                                        return (
                                            <SelectItem key={adapter.code} value={adapter.code}>
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-5 h-5 rounded flex items-center justify-center text-white"
                                                        style={{ backgroundColor: adapter.color }}
                                                    >
                                                        <Icon className="w-3 h-3" />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium">{adapter.name}</div>
                                                        {adapter.description && (
                                                            <div className="text-xs text-muted-foreground">
                                                                {adapter.description}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>

                            {selectedAdapter && (
                                <div className="flex items-center gap-2 p-2 bg-muted rounded">
                                    <div
                                        className="w-8 h-8 rounded flex items-center justify-center text-white"
                                        style={{ backgroundColor: selectedAdapter.color }}
                                    >
                                        <selectedAdapter.icon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-sm">{selectedAdapter.name}</div>
                                        {selectedAdapter.description && (
                                            <div className="text-xs text-muted-foreground">{selectedAdapter.description}</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Adapter-specific configuration */}
                    {selectedAdapter?.schema?.fields?.length > 0 && (
                        <Card>
                            <CardHeader className="py-3">
                                <CardTitle className="text-sm">Configuration</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <SchemaFormRenderer
                                    fields={dynamicFields}
                                    values={step.config}
                                    onChange={updateConfigBatch}
                                    secretOptions={secretOptions}
                                />
                            </CardContent>
                        </Card>
                    )}

                    {/* Advanced Editors for common operators */}
                    {adapterType === 'operator' && selectedAdapter?.code === 'map' && (
                        <AdvancedMapEditor config={step.config} onChange={updateConfigBatch} />)
                    }
                    {adapterType === 'operator' && selectedAdapter?.code === 'template' && (
                        <AdvancedTemplateEditor config={step.config} onChange={updateConfigBatch} />)
                    }
                    {adapterType === 'operator' && selectedAdapter?.code === 'when' && (
                        <AdvancedWhenEditor config={step.config} onChange={updateConfigBatch} />)
                    }
                    {/* Tester (parity with Visual editor) */}
                    {(adapterType && selectedAdapter) && (
                        <StepTester stepType={step.type} adapterType={adapterType} config={step.config} />
                    )}
                </div>
            )}

            {/* Route Configuration */}
            {step.type === 'ROUTE' && (
                <RouteConfigForm
                    config={step.config}
                    onChange={updateConfigBatch}
                />
            )}

            {/* Validate Configuration */}
            {step.type === 'VALIDATE' && (
                <ValidateConfigForm
                    config={step.config}
                    onChange={updateConfigBatch}
                />
            )}
        </div>
        
    );
}

// TRIGGER CONFIG

interface TriggerConfigFormProps {
    readonly config: Record<string, unknown>;
    readonly onChange: (config: Record<string, unknown>) => void;
}

function TriggerConfigForm({ config, onChange }: TriggerConfigFormProps) {
    const triggerType = String(config.type ?? 'manual');

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <label className="text-sm font-medium">Trigger Type</label>
                <Select
                    value={triggerType}
                    onValueChange={(v) => onChange({ ...config, type: v })}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="manual">Manual (Dashboard)</SelectItem>
                        <SelectItem value="schedule">Scheduled (Cron)</SelectItem>
                        <SelectItem value="webhook">Webhook</SelectItem>
                        <SelectItem value="event">Vendure Event</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {triggerType === 'schedule' && (
                <div className="space-y-2">
                    <label className="text-sm font-medium">Cron Expression</label>
                    <Input
                        value={String(config.cron ?? '')}
                        onChange={(e) => onChange({ ...config, cron: e.target.value })}
                        placeholder="0 * * * *"
                        className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                        Examples: "0 * * * *" (hourly), "0 0 * * *" (daily), "0 0 * * 1" (weekly on Monday)
                    </p>
                </div>
            )}

            {triggerType === 'webhook' && (
                <div className="space-y-2">
                    <label className="text-sm font-medium">Webhook Path</label>
                    <Input
                        value={String(config.webhookPath ?? '')}
                        onChange={(e) => onChange({ ...config, webhookPath: e.target.value })}
                        placeholder="/my-webhook"
                    />
                </div>
            )}

            {triggerType === 'event' && (
                <div className="space-y-2">
                    <label className="text-sm font-medium">Event Type</label>
                    <Select
                        value={String(config.eventType ?? '')}
                        onValueChange={(v) => onChange({ ...config, eventType: v })}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select event..." />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(VENDURE_EVENTS_BY_CATEGORY).map(([category, events]) => (
                                <React.Fragment key={category}>
                                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                                        {category}
                                    </div>
                                    {events.map((event) => (
                                        <SelectItem key={event.event} value={event.event}>
                                            {event.label}
                                        </SelectItem>
                                    ))}
                                </React.Fragment>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
        </div>
    );
}

// ROUTE CONFIG

interface RouteConfigFormProps {
    readonly config: Record<string, unknown>;
    readonly onChange: (config: Record<string, unknown>) => void;
}

function RouteConfigForm({ config, onChange }: RouteConfigFormProps) {
    const branches = (config.branches as Array<{ name: string }>) ?? [];

    // Check for duplicate branch names
    const getDuplicateBranches = React.useCallback((branchList: Array<{ name: string }>) => {
        const names = branchList.map(b => b.name.trim().toLowerCase());
        const duplicates = new Set<string>();
        const seen = new Set<string>();
        for (const name of names) {
            if (name && seen.has(name)) {
                duplicates.add(name);
            }
            seen.add(name);
        }
        return duplicates;
    }, []);

    const duplicates = getDuplicateBranches(branches);
    const hasDuplicates = duplicates.size > 0;

    const addBranch = () => {
        // Generate a unique branch name
        let branchNum = branches.length + 1;
        let newName = `branch-${branchNum}`;
        const existingNames = new Set(branches.map(b => b.name.toLowerCase()));
        while (existingNames.has(newName.toLowerCase())) {
            branchNum++;
            newName = `branch-${branchNum}`;
        }

        onChange({
            ...config,
            branches: [...branches, { name: newName }],
        });
    };

    const updateBranch = (index: number, name: string) => {
        const newBranches = [...branches];
        newBranches[index] = { ...newBranches[index], name };
        onChange({ ...config, branches: newBranches });
    };

    const removeBranch = (index: number) => {
        onChange({ ...config, branches: branches.filter((_, i) => i !== index) });
    };

    const isBranchDuplicate = (branchName: string) => {
        return duplicates.has(branchName.trim().toLowerCase());
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Branches</label>
                <Button variant="outline" size="sm" onClick={addBranch}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add Branch
                </Button>
            </div>

            {/* Duplicate warning */}
            {hasDuplicates && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <div className="flex items-center gap-2 text-amber-800">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm font-medium">Duplicate branch names detected</span>
                    </div>
                    <p className="text-xs text-amber-700 mt-1">
                        Branch names must be unique. Duplicate: {Array.from(duplicates).join(', ')}
                    </p>
                </div>
            )}

            {branches.map((branch, i) => (
                <div key={i} className="flex items-center gap-2">
                    <div className="flex-1">
                        <Input
                            value={branch.name}
                            onChange={(e) => updateBranch(i, e.target.value)}
                            placeholder="Branch name"
                            className={isBranchDuplicate(branch.name) ? 'border-amber-300 focus:border-amber-500' : ''}
                        />
                        {!branch.name.trim() && (
                            <p className="text-xs text-destructive mt-1">Branch name cannot be empty</p>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeBranch(i)}
                        className="text-destructive"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            ))}

            {branches.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    Add branches to route records based on conditions.
                </p>
            )}
        </div>
    );
}

// VALIDATE CONFIG

interface ValidateConfigFormProps {
    readonly config: Record<string, unknown>;
    readonly onChange: (config: Record<string, unknown>) => void;
}

function ValidateConfigForm({ config, onChange }: ValidateConfigFormProps) {
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <label className="text-sm font-medium">Validation Mode</label>
                <Select
                    value={String(config.mode ?? 'fail-fast')}
                    onValueChange={(v) => onChange({ ...config, mode: v })}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="fail-fast">Fail Fast (stop on first error)</SelectItem>
                        <SelectItem value="accumulate">Accumulate (collect all errors)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">Schema (optional)</label>
                <Input
                    value={String(config.schemaCode ?? '')}
                    onChange={(e) => onChange({ ...config, schemaCode: e.target.value || undefined })}
                    placeholder="schema-code"
                />
                <p className="text-xs text-muted-foreground">
                    Reference a validation schema defined in DataHub
                </p>
            </div>
        </div>
    );
}

// HELPERS (using centralized utilities from utils/step-helpers.ts)

// TRIGGERS PANEL

interface TriggersPanelProps {
    readonly triggers: TriggerConfig[];
    readonly onChange: (triggers: TriggerConfig[]) => void;
}

function TriggersPanel({ triggers, onChange }: TriggersPanelProps) {
    const addTrigger = (type: TriggerConfig['type']) => {
        const newTrigger: TriggerConfig = { type, enabled: true };
        if (type === 'schedule') {
            newTrigger.cron = '0 0 * * *';
        }
        onChange([...triggers, newTrigger]);
    };

    const updateTrigger = (index: number, updated: TriggerConfig) => {
        const newTriggers = [...triggers];
        newTriggers[index] = updated;
        onChange(newTriggers);
    };

    const removeTrigger = (index: number) => {
        onChange(triggers.filter((_, i) => i !== index));
    };

    const TRIGGER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
        manual: Play,
        schedule: Calendar,
        webhook: Webhook,
        event: Bell,
        file: Download,
    };

    return (
        <div className="flex flex-col h-full">
            <div className="p-3 border-b bg-muted/50">
                <h3 className="font-semibold text-sm">Pipeline Triggers</h3>
                <p className="text-xs text-muted-foreground">When should this pipeline run?</p>
            </div>

            <div className="flex-1 overflow-auto p-2 space-y-2">
                {triggers.map((trigger, index) => {
                    const Icon = TRIGGER_ICONS[trigger.type] ?? Play;
                    return (
                        <div
                            key={index}
                            className="border rounded-md p-3 space-y-3"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Icon className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium text-sm capitalize">{trigger.type}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={trigger.enabled !== false}
                                        onCheckedChange={(enabled) => updateTrigger(index, { ...trigger, enabled })}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-destructive"
                                        onClick={() => removeTrigger(index)}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>

                            {/* Schedule Config */}
                            {trigger.type === 'schedule' && (
                                <div className="space-y-2">
                                    <Label className="text-xs">Cron Expression</Label>
                                    <Input
                                        value={trigger.cron ?? ''}
                                        onChange={(e) => updateTrigger(index, {
                                            ...trigger,
                                            cron: e.target.value,
                                        })}
                                        placeholder="0 0 * * *"
                                        className="font-mono text-xs"
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                        e.g., "0 * * * *" (hourly), "0 0 * * *" (daily)
                                    </p>
                                </div>
                            )}

                            {/* Webhook Config */}
                            {trigger.type === 'webhook' && (
                                <div className="space-y-2">
                                    <Label className="text-xs">Webhook Code</Label>
                                    <Input
                                        value={trigger.webhookCode ?? ''}
                                        onChange={(e) => updateTrigger(index, { ...trigger, webhookCode: e.target.value })}
                                        placeholder="my-webhook"
                                        className="text-xs"
                                    />
                                </div>
                            )}

                            {/* Event Config */}
                            {trigger.type === 'event' && (
                                <div className="space-y-2">
                                    <Label className="text-xs">Event Type</Label>
                                    <Select
                                        value={trigger.eventType ?? ''}
                                        onValueChange={(v) => updateTrigger(index, { ...trigger, eventType: v })}
                                    >
                                        <SelectTrigger className="text-xs">
                                            <SelectValue placeholder="Select event..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Object.entries(VENDURE_EVENTS_BY_CATEGORY).map(([category, events]) => (
                                                <React.Fragment key={category}>
                                                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                                                        {category}
                                                    </div>
                                                    {events.map((event) => (
                                                        <SelectItem key={event.event} value={event.event}>
                                                            {event.label}
                                                        </SelectItem>
                                                    ))}
                                                </React.Fragment>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {/* File Watch Config */}
                            {trigger.type === 'file' && (
                                <div className="space-y-2">
                                    <Label className="text-xs">Connection Code</Label>
                                    <Input
                                        value={trigger.fileWatch?.connectionCode ?? ''}
                                        onChange={(e) => updateTrigger(index, {
                                            ...trigger,
                                            fileWatch: { ...trigger.fileWatch!, connectionCode: e.target.value, path: trigger.fileWatch?.path ?? '' },
                                        })}
                                        placeholder="my-ftp-connection"
                                        className="text-xs"
                                    />
                                    <Label className="text-xs">Watch Path</Label>
                                    <Input
                                        value={trigger.fileWatch?.path ?? ''}
                                        onChange={(e) => updateTrigger(index, {
                                            ...trigger,
                                            fileWatch: { ...trigger.fileWatch!, path: e.target.value, connectionCode: trigger.fileWatch?.connectionCode ?? '' },
                                        })}
                                        placeholder="/incoming/*.csv"
                                        className="text-xs"
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}

                {triggers.length === 0 && (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                        No triggers configured. Add a trigger below.
                    </div>
                )}
            </div>

            <div className="p-3 border-t bg-muted/50">
                <p className="text-xs text-muted-foreground mb-2">Add Trigger:</p>
                <div className="grid grid-cols-2 gap-1">
                    {(['manual', 'schedule', 'webhook', 'event', 'file'] as const).map((type) => {
                        const Icon = TRIGGER_ICONS[type];
                        return (
                            <Button
                                key={type}
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs justify-start"
                                onClick={() => addTrigger(type)}
                            >
                                <Icon className="h-3 w-3 mr-1" />
                                <span className="capitalize">{type}</span>
                            </Button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// PIPELINE SETTINGS PANEL

interface PipelineSettingsPanelProps {
    readonly context: PipelineContext;
    readonly onChange: (context: PipelineContext) => void;
}

function PipelineSettingsPanel({ context, onChange }: PipelineSettingsPanelProps) {
    const updateErrorHandling = (errorHandling: ErrorHandlingConfig) => {
        onChange({ ...context, errorHandling });
    };

    const updateCheckpointing = (checkpointing: CheckpointingConfig) => {
        onChange({ ...context, checkpointing });
    };

    const updateThroughput = (throughput: ThroughputConfig) => {
        onChange({ ...context, throughput });
    };

    return (
        <div className="flex flex-col h-full overflow-auto">
            <div className="p-3 border-b bg-muted/50">
                <h3 className="font-semibold text-sm">Pipeline Settings</h3>
                <p className="text-xs text-muted-foreground">Execution configuration</p>
            </div>

            <div className="p-3 space-y-4">
                {/* Run Mode */}
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Run Mode</Label>
                    <Select
                        value={context.runMode ?? 'batch'}
                        onValueChange={(v) => onChange({ ...context, runMode: v as PipelineContext['runMode'] })}
                    >
                        <SelectTrigger className="text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="sync">Sync (blocking)</SelectItem>
                            <SelectItem value="async">Async (background)</SelectItem>
                            <SelectItem value="batch">Batch (grouped)</SelectItem>
                            <SelectItem value="stream">Stream (real-time)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Error Handling Section */}
                <Card>
                    <CardHeader className="py-2 px-3">
                        <CardTitle className="text-xs flex items-center gap-2">
                            <AlertTriangle className="h-3 w-3 text-amber-500" />
                            Error Handling
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className="text-[10px]">Max Retries</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={10}
                                    value={context.errorHandling?.maxRetries ?? 3}
                                    onChange={(e) => updateErrorHandling({
                                        ...context.errorHandling,
                                        maxRetries: parseInt(e.target.value) || 0,
                                    })}
                                    className="h-7 text-xs"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px]">Retry Delay (ms)</Label>
                                <Input
                                    type="number"
                                    min={100}
                                    value={context.errorHandling?.retryDelayMs ?? 1000}
                                    onChange={(e) => updateErrorHandling({
                                        ...context.errorHandling,
                                        retryDelayMs: parseInt(e.target.value) || 1000,
                                    })}
                                    className="h-7 text-xs"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className="text-[10px]">Max Delay (ms)</Label>
                                <Input
                                    type="number"
                                    min={1000}
                                    value={context.errorHandling?.maxRetryDelayMs ?? 30000}
                                    onChange={(e) => updateErrorHandling({
                                        ...context.errorHandling,
                                        maxRetryDelayMs: parseInt(e.target.value) || 30000,
                                    })}
                                    className="h-7 text-xs"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px]">Backoff Multiplier</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={5}
                                    step={0.5}
                                    value={context.errorHandling?.backoffMultiplier ?? 2}
                                    onChange={(e) => updateErrorHandling({
                                        ...context.errorHandling,
                                        backoffMultiplier: parseFloat(e.target.value) || 2,
                                    })}
                                    className="h-7 text-xs"
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <Label className="text-[10px]">Dead Letter Queue</Label>
                            <Switch
                                checked={context.errorHandling?.deadLetterQueue ?? false}
                                onCheckedChange={(v) => updateErrorHandling({
                                    ...context.errorHandling,
                                    deadLetterQueue: v,
                                })}
                            />
                        </div>
                        {context.errorHandling?.deadLetterQueue && (
                            <div className="flex items-center justify-between">
                                <Label className="text-[10px]">Alert on Dead Letter</Label>
                                <Switch
                                    checked={context.errorHandling?.alertOnDeadLetter ?? false}
                                    onCheckedChange={(v) => updateErrorHandling({
                                        ...context.errorHandling,
                                        alertOnDeadLetter: v,
                                    })}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Checkpointing Section */}
                <Card>
                    <CardHeader className="py-2 px-3">
                        <CardTitle className="text-xs flex items-center gap-2">
                            <Clock className="h-3 w-3 text-blue-500" />
                            Checkpointing
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-[10px]">Enable Checkpointing</Label>
                            <Switch
                                checked={context.checkpointing?.enabled ?? false}
                                onCheckedChange={(v) => updateCheckpointing({
                                    ...context.checkpointing,
                                    enabled: v,
                                })}
                            />
                        </div>
                        {context.checkpointing?.enabled && (
                            <>
                                <div className="space-y-1">
                                    <Label className="text-[10px]">Strategy</Label>
                                    <Select
                                        value={context.checkpointing?.strategy ?? 'count'}
                                        onValueChange={(v) => updateCheckpointing({
                                            ...context.checkpointing,
                                            strategy: v as CheckpointingConfig['strategy'],
                                        })}
                                    >
                                        <SelectTrigger className="h-7 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="count">By Record Count</SelectItem>
                                            <SelectItem value="interval">By Time Interval</SelectItem>
                                            <SelectItem value="timestamp">By Timestamp Field</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {context.checkpointing?.strategy === 'count' && (
                                    <div className="space-y-1">
                                        <Label className="text-[10px]">Checkpoint Every N Records</Label>
                                        <Input
                                            type="number"
                                            min={100}
                                            value={context.checkpointing?.intervalRecords ?? 1000}
                                            onChange={(e) => updateCheckpointing({
                                                ...context.checkpointing,
                                                intervalRecords: parseInt(e.target.value) || 1000,
                                            })}
                                            className="h-7 text-xs"
                                        />
                                    </div>
                                )}
                                {context.checkpointing?.strategy === 'interval' && (
                                    <div className="space-y-1">
                                        <Label className="text-[10px]">Checkpoint Interval (ms)</Label>
                                        <Input
                                            type="number"
                                            min={1000}
                                            value={context.checkpointing?.intervalMs ?? 60000}
                                            onChange={(e) => updateCheckpointing({
                                                ...context.checkpointing,
                                                intervalMs: parseInt(e.target.value) || 60000,
                                            })}
                                            className="h-7 text-xs"
                                        />
                                    </div>
                                )}
                                {context.checkpointing?.strategy === 'timestamp' && (
                                    <div className="space-y-1">
                                        <Label className="text-[10px]">Timestamp Field</Label>
                                        <Input
                                            value={context.checkpointing?.field ?? 'updatedAt'}
                                            onChange={(e) => updateCheckpointing({
                                                ...context.checkpointing,
                                                field: e.target.value,
                                            })}
                                            placeholder="updatedAt"
                                            className="h-7 text-xs"
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Throughput Section */}
                <Card>
                    <CardHeader className="py-2 px-3">
                        <CardTitle className="text-xs flex items-center gap-2">
                            <Zap className="h-3 w-3 text-green-500" />
                            Throughput
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className="text-[10px]">Batch Size</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={context.throughput?.batchSize ?? 100}
                                    onChange={(e) => updateThroughput({
                                        ...context.throughput,
                                        batchSize: parseInt(e.target.value) || 100,
                                    })}
                                    className="h-7 text-xs"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px]">Concurrency</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={32}
                                    value={context.throughput?.concurrency ?? 4}
                                    onChange={(e) => updateThroughput({
                                        ...context.throughput,
                                        concurrency: parseInt(e.target.value) || 4,
                                    })}
                                    className="h-7 text-xs"
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px]">Rate Limit (requests/sec)</Label>
                            <Input
                                type="number"
                                min={0}
                                value={context.throughput?.rateLimitRps ?? 0}
                                onChange={(e) => updateThroughput({
                                    ...context.throughput,
                                    rateLimitRps: parseInt(e.target.value) || 0,
                                })}
                                placeholder="0 = unlimited"
                                className="h-7 text-xs"
                            />
                            <p className="text-[10px] text-muted-foreground">0 = no rate limiting</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
