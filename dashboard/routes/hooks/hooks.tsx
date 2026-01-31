import * as React from 'react';
import {
    Button,
    DashboardRouteDefinition,
    Json,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    PermissionGuard,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Badge,
    Label,
} from '@vendure/dashboard';
import { toast } from 'sonner';
import { DATAHUB_NAV_SECTION, UI_DEFAULTS, QUERY_LIMITS, ROUTES, DATAHUB_PERMISSIONS, TOAST_HOOK } from '../../constants';
import {
    Play,
    RefreshCw,
    Zap,
    ArrowRight,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Info,
    Clock,
    Database,
    Filter,
    Upload,
    Loader2,
} from 'lucide-react';
import {
    usePipelines,
    usePipelineHooks,
    useEvents,
    useTestHook,
    handleMutationError,
} from '../../hooks';
import { ErrorState, LoadingState } from '../../components/shared';

export const hooksPage: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-hooks',
        url: ROUTES.HOOKS,
        title: 'Hooks & Events',
    },
    path: ROUTES.HOOKS,
    loader: () => ({ breadcrumb: 'Hooks & Events' }),
    component: () => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.UPDATE_PIPELINE]}>
            <HooksPage />
        </PermissionGuard>
    ),
};

interface HookStage {
    key: string;
    label: string;
    description: string;
    icon: React.ReactNode;
    category: 'lifecycle' | 'data' | 'error';
    examplePayload: Record<string, unknown>;
}

const HOOK_STAGES: HookStage[] = [
    {
        key: 'PIPELINE_STARTED',
        label: 'Pipeline Started',
        description: 'Triggered when a pipeline run begins',
        icon: <Play className="w-4 h-4" />,
        category: 'lifecycle',
        examplePayload: { pipelineCode: 'my-pipeline', runId: '123' },
    },
    {
        key: 'PIPELINE_COMPLETED',
        label: 'Pipeline Completed',
        description: 'Triggered when a pipeline finishes successfully',
        icon: <CheckCircle2 className="w-4 h-4" />,
        category: 'lifecycle',
        examplePayload: { pipelineCode: 'my-pipeline', runId: '123', recordsProcessed: 100, duration: 5000 },
    },
    {
        key: 'PIPELINE_FAILED',
        label: 'Pipeline Failed',
        description: 'Triggered when a pipeline encounters a fatal error',
        icon: <XCircle className="w-4 h-4" />,
        category: 'lifecycle',
        examplePayload: { pipelineCode: 'my-pipeline', runId: '123', error: 'Connection timeout' },
    },
    {
        key: 'BEFORE_EXTRACT',
        label: 'Before Extract',
        description: 'Before data is pulled from the source',
        icon: <Database className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'extract', config: {} },
    },
    {
        key: 'AFTER_EXTRACT',
        label: 'After Extract',
        description: 'After data has been extracted',
        icon: <Database className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'extract', recordCount: 50, records: [{ id: 1 }] },
    },
    {
        key: 'BEFORE_TRANSFORM',
        label: 'Before Transform',
        description: 'Before data transformation begins',
        icon: <Filter className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'transform', recordCount: 50 },
    },
    {
        key: 'AFTER_TRANSFORM',
        label: 'After Transform',
        description: 'After data has been transformed',
        icon: <Filter className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'transform', recordCount: 48, dropped: 2 },
    },
    {
        key: 'BEFORE_VALIDATE',
        label: 'Before Validate',
        description: 'Before schema validation runs',
        icon: <CheckCircle2 className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'validate', schemaCode: 'product-schema' },
    },
    {
        key: 'AFTER_VALIDATE',
        label: 'After Validate',
        description: 'After validation completes',
        icon: <CheckCircle2 className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'validate', valid: 45, invalid: 3 },
    },
    {
        key: 'BEFORE_ENRICH',
        label: 'Before Enrich',
        description: 'Before data enrichment step',
        icon: <Zap className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'enrich' },
    },
    {
        key: 'AFTER_ENRICH',
        label: 'After Enrich',
        description: 'After data has been enriched',
        icon: <Zap className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'enrich', enrichedFields: ['category', 'price'] },
    },
    {
        key: 'BEFORE_ROUTE',
        label: 'Before Route',
        description: 'Before records are routed to destinations',
        icon: <ArrowRight className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'route', recordCount: 45 },
    },
    {
        key: 'AFTER_ROUTE',
        label: 'After Route',
        description: 'After routing decisions are made',
        icon: <ArrowRight className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'route', destinations: { products: 30, inventory: 15 } },
    },
    {
        key: 'BEFORE_LOAD',
        label: 'Before Load',
        description: 'Before data is written to destination',
        icon: <Upload className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'load', destination: 'vendure', recordCount: 45 },
    },
    {
        key: 'AFTER_LOAD',
        label: 'After Load',
        description: 'After data has been loaded',
        icon: <Upload className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'load', created: 20, updated: 25, errors: 0 },
    },
    {
        key: 'ON_ERROR',
        label: 'On Error',
        description: 'When any error occurs during processing',
        icon: <AlertTriangle className="w-4 h-4" />,
        category: 'error',
        examplePayload: { error: 'Validation failed', record: { id: 1 }, stepKey: 'validate' },
    },
    {
        key: 'ON_RETRY',
        label: 'On Retry',
        description: 'When a failed record is retried',
        icon: <RefreshCw className="w-4 h-4" />,
        category: 'error',
        examplePayload: { errorId: '456', attempt: 2, maxAttempts: 3 },
    },
    {
        key: 'ON_DEAD_LETTER',
        label: 'On Dead Letter',
        description: 'When a record is moved to dead letter queue',
        icon: <XCircle className="w-4 h-4" />,
        category: 'error',
        examplePayload: { errorId: '456', reason: 'Max retries exceeded', record: { id: 1 } },
    },
];

const STAGE_CATEGORIES = {
    lifecycle: { label: 'Lifecycle', color: 'bg-blue-100 text-blue-800', description: 'Track pipeline start, completion, and failure', gridClass: 'grid-cols-3' },
    data: { label: 'Data Processing', color: 'bg-green-100 text-green-800', description: 'Intercept data at each processing step', gridClass: 'grid-cols-4' },
    error: { label: 'Error Handling', color: 'bg-red-100 text-red-800', description: 'Handle errors and retries', gridClass: 'grid-cols-3' },
} as const;

interface HookStageSectionProps {
    category: keyof typeof STAGE_CATEGORIES;
    hooks: Record<string, unknown>;
    selectedStage: HookStage | null;
    isPending: boolean;
    testResult: 'success' | 'error' | null;
    onTest: (stage: HookStage) => void;
    disabled: boolean;
}

function HookStageSection({ category, hooks, selectedStage, isPending, testResult, onTest, disabled }: HookStageSectionProps) {
    const categoryInfo = STAGE_CATEGORIES[category];
    const stages = HOOK_STAGES.filter(s => s.category === category);

    return (
        <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
                <Badge className={categoryInfo.color}>{categoryInfo.label}</Badge>
                <span className="text-sm text-muted-foreground">{categoryInfo.description}</span>
            </div>
            <div className={`grid gap-3 ${categoryInfo.gridClass}`}>
                {stages.map(stage => (
                    <HookStageCard
                        key={stage.key}
                        stage={stage}
                        isConfigured={!!hooks[stage.key]}
                        isSelected={selectedStage?.key === stage.key}
                        isLoading={isPending && selectedStage?.key === stage.key}
                        testResult={selectedStage?.key === stage.key ? testResult : null}
                        onTest={() => onTest(stage)}
                        disabled={disabled}
                    />
                ))}
            </div>
        </div>
    );
}

function HooksPage() {
    const [pipelineId, setPipelineId] = React.useState<string>('');
    const [selectedStage, setSelectedStage] = React.useState<HookStage | null>(null);
    const [testResult, setTestResult] = React.useState<'success' | 'error' | null>(null);
    const [eventFilter, setEventFilter] = React.useState('');

    const pipelinesQuery = usePipelines({ take: QUERY_LIMITS.ALL_ITEMS });
    const hooksQuery = usePipelineHooks(pipelineId || undefined);
    const eventsQuery = useEvents(UI_DEFAULTS.EVENTS_LIMIT);
    const testMutation = useTestHook();

    const hooks = hooksQuery.data ?? {};
    const pipelines = pipelinesQuery.data?.items ?? [];
    const selectedPipeline = pipelines.find(p => p.id === pipelineId);

    const isLoading = pipelinesQuery.isLoading;
    const hasError = pipelinesQuery.isError || eventsQuery.isError;
    const errorMessage = pipelinesQuery.error?.message || eventsQuery.error?.message;

    const runTest = (stage: HookStage) => {
        if (!pipelineId) {
            toast.error(TOAST_HOOK.SELECT_PIPELINE_FIRST);
            return;
        }
        setSelectedStage(stage);
        setTestResult(null);
        testMutation.mutate(
            {
                pipelineId,
                stage: stage.key,
                payload: stage.examplePayload,
            },
            {
                onSuccess: () => {
                    setTestResult('success');
                    toast.success(TOAST_HOOK.TEST_SUCCESS);
                    eventsQuery.refetch();
                },
                onError: (err: unknown) => {
                    setTestResult('error');
                    handleMutationError('test hook', err);
                },
            }
        );
    };

    return (
        <Page pageId="data-hub-hooks">
            <PageActionBar>
                <PageActionBarRight>
                    <Button
                        variant="ghost"
                        onClick={() => eventsQuery.refetch()}
                        disabled={eventsQuery.isFetching}
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${eventsQuery.isFetching ? 'animate-spin' : ''}`} />
                        Refresh Events
                    </Button>
                </PageActionBarRight>
            </PageActionBar>

            {hasError && (
                <PageBlock column="main" blockId="error">
                    <ErrorState
                        title="Failed to load data"
                        message={errorMessage || 'An unexpected error occurred'}
                        onRetry={() => {
                            pipelinesQuery.refetch();
                            eventsQuery.refetch();
                        }}
                    />
                </PageBlock>
            )}

            {isLoading && !hasError && (
                <PageBlock column="main" blockId="loading">
                    <LoadingState type="card" rows={3} message="Loading pipelines and hooks..." />
                </PageBlock>
            )}

            <PageBlock column="main" blockId="intro">
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Zap className="w-5 h-5 text-primary" />
                            <CardTitle>Pipeline Hooks</CardTitle>
                        </div>
                        <CardDescription>
                            Hooks let you run custom code at specific points during pipeline execution.
                            Select a pipeline below to view its configured hooks and test them with sample data.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end gap-4">
                            <div className="flex-1 max-w-xs">
                                <Label className="text-sm font-medium mb-1.5 block">
                                    Select Pipeline
                                </Label>
                                <Select value={pipelineId} onValueChange={setPipelineId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Choose a pipeline to test..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {pipelines.map(p => (
                                            <SelectItem key={p.id} value={p.id}>
                                                {p.name}
                                                <span className="text-muted-foreground ml-2 text-xs">
                                                    ({p.code})
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {selectedPipeline && (
                                <div className="text-sm text-muted-foreground">
                                    <Info className="w-4 h-4 inline mr-1" />
                                    Testing hooks for <strong>{selectedPipeline.name}</strong>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </PageBlock>

            <PageBlock column="main" blockId="stages">
                <div className="mb-4">
                    <h3 className="text-lg font-semibold mb-1">Available Hook Stages</h3>
                    <p className="text-sm text-muted-foreground">
                        Click any hook to test it with sample data. Results will appear in the Events section below.
                    </p>
                </div>

                <HookStageSection
                    category="lifecycle"
                    hooks={hooks as Record<string, unknown>}
                    selectedStage={selectedStage}
                    isPending={testMutation.isPending}
                    testResult={testResult}
                    onTest={runTest}
                    disabled={!pipelineId}
                />

                <HookStageSection
                    category="data"
                    hooks={hooks as Record<string, unknown>}
                    selectedStage={selectedStage}
                    isPending={testMutation.isPending}
                    testResult={testResult}
                    onTest={runTest}
                    disabled={!pipelineId}
                />

                <HookStageSection
                    category="error"
                    hooks={hooks as Record<string, unknown>}
                    selectedStage={selectedStage}
                    isPending={testMutation.isPending}
                    testResult={testResult}
                    onTest={runTest}
                    disabled={!pipelineId}
                />
            </PageBlock>

            {pipelineId && Object.keys(hooks).length > 0 && (
                <PageBlock column="main" blockId="configured">
                    <details className="group">
                        <summary className="cursor-pointer text-sm font-medium mb-2 flex items-center gap-2">
                            <span>View Raw Hook Configuration</span>
                            <span className="text-muted-foreground">(Advanced)</span>
                        </summary>
                        <div className="mt-2 p-3 bg-muted rounded-lg">
                            <Json value={hooks} />
                        </div>
                    </details>
                </PageBlock>
            )}

            <PageBlock column="main" blockId="events">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-semibold">Recent Events</h3>
                        <p className="text-sm text-muted-foreground">
                            Live feed of events triggered by hooks (auto-refreshes every 5s)
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            className="border rounded px-3 py-1.5 text-sm w-48"
                            placeholder="Filter events..."
                            value={eventFilter}
                            onChange={e => setEventFilter(e.target.value)}
                        />
                    </div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-muted">
                                <th className="text-left px-3 py-2 w-32">Time</th>
                                <th className="text-left px-3 py-2 w-48">Event</th>
                                <th className="text-left px-3 py-2">Payload</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Events have unique createdAt timestamps, used as stable keys */}
                            {(eventsQuery.data ?? [])
                                .filter(e => !eventFilter || (e.name ?? '').toLowerCase().includes(eventFilter.toLowerCase()))
                                .slice(0, 20)
                                .map((e) => (
                                    <tr key={`${e.createdAt}-${e.name}`} className="border-t align-top hover:bg-muted/50">
                                        <td className="px-3 py-2 text-muted-foreground">
                                            <Clock className="w-3 h-3 inline mr-1" />
                                            {new Date(e.createdAt as string).toLocaleTimeString()}
                                        </td>
                                        <td className="px-3 py-2">
                                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                                {e.name}
                                            </code>
                                        </td>
                                        <td className="px-3 py-2">
                                            <Json value={e.payload as Record<string, unknown>} />
                                        </td>
                                    </tr>
                                ))}
                            {(eventsQuery.data ?? []).length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                                        <Info className="w-5 h-5 mx-auto mb-2 opacity-50" />
                                        No events yet. Test a hook to see events appear here.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </PageBlock>
        </Page>
    );
}

const HookStageCard = React.memo(function HookStageCard({
    stage,
    isConfigured,
    isSelected,
    isLoading,
    testResult,
    onTest,
    disabled,
}: Readonly<{
    stage: HookStage;
    isConfigured: boolean;
    isSelected: boolean;
    isLoading: boolean;
    testResult: 'success' | 'error' | null;
    onTest: () => void;
    disabled: boolean;
}>) {
    const handleClick = React.useCallback(() => {
        if (!disabled) {
            onTest();
        }
    }, [disabled, onTest]);

    return (
        <div
            className={`
                border rounded-lg p-3 transition-all cursor-pointer
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary hover:shadow-sm'}
                ${isSelected ? 'border-primary ring-1 ring-primary' : ''}
                ${isConfigured ? 'bg-primary/5' : ''}
            `}
            onClick={handleClick}
        >
            <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded ${isConfigured ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {stage.icon}
                    </div>
                    <div>
                        <div className="font-medium text-sm">{stage.label}</div>
                        {isConfigured && (
                            <Badge variant="outline" className="text-xs mt-0.5">
                                Configured
                            </Badge>
                        )}
                    </div>
                </div>
                {isLoading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                {!isLoading && testResult === 'success' && (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                )}
                {!isLoading && testResult === 'error' && (
                    <XCircle className="w-4 h-4 text-red-600" />
                )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
                {stage.description}
            </p>
            {!disabled && (
                <div className="mt-2 pt-2 border-t">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Play className="w-3 h-3" />
                        Click to test
                    </div>
                </div>
            )}
        </div>
    );
});
