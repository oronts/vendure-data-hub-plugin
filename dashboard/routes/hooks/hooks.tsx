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
import { graphql } from '@/gql';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { toast } from 'sonner';
import { DATAHUB_NAV_SECTION, UI_DEFAULTS } from '../../constants/index';
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

// GRAPHQL

const hooksQuery = graphql(`
    query DataHubPipelineHooks($pipelineId: ID!) {
        dataHubPipelineHooks(pipelineId: $pipelineId)
    }
`);

const pipelinesQuery = graphql(`
    query DataHubPipelinesForHooks {
        dataHubPipelines(options: { take: 999 }) {
            items { id name code }
            totalItems
        }
    }
`);

const runHookTest = graphql(`
    mutation RunDataHubHookTest($pipelineId: ID!, $stage: String!, $payload: JSON) {
        runDataHubHookTest(pipelineId: $pipelineId, stage: $stage, payload: $payload)
    }
`);

const eventsQuery = graphql(`
    query DataHubEvents($limit: Int) {
        dataHubEvents(limit: $limit) { name createdAt payload }
    }
`);

// ROUTE DEFINITION

export const hooksRoute: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-hooks',
        url: '/data-hub/hooks',
        title: 'Hooks & Events',
    },
    path: '/data-hub/hooks',
    loader: () => ({ breadcrumb: 'Hooks & Events' }),
    component: () => (
        <PermissionGuard requires={['UpdateDataHubPipeline']}>
            <HooksPage />
        </PermissionGuard>
    ),
};

// HOOK STAGE DEFINITIONS

interface HookStage {
    key: string;
    label: string;
    description: string;
    icon: React.ReactNode;
    category: 'lifecycle' | 'data' | 'error';
    examplePayload: Record<string, unknown>;
}

const HOOK_STAGES: HookStage[] = [
    // Lifecycle hooks
    {
        key: 'pipelineStarted',
        label: 'Pipeline Started',
        description: 'Triggered when a pipeline run begins',
        icon: <Play className="w-4 h-4" />,
        category: 'lifecycle',
        examplePayload: { pipelineCode: 'my-pipeline', runId: '123' },
    },
    {
        key: 'pipelineCompleted',
        label: 'Pipeline Completed',
        description: 'Triggered when a pipeline finishes successfully',
        icon: <CheckCircle2 className="w-4 h-4" />,
        category: 'lifecycle',
        examplePayload: { pipelineCode: 'my-pipeline', runId: '123', recordsProcessed: 100, duration: 5000 },
    },
    {
        key: 'pipelineFailed',
        label: 'Pipeline Failed',
        description: 'Triggered when a pipeline encounters a fatal error',
        icon: <XCircle className="w-4 h-4" />,
        category: 'lifecycle',
        examplePayload: { pipelineCode: 'my-pipeline', runId: '123', error: 'Connection timeout' },
    },
    // Data processing hooks
    {
        key: 'beforeExtract',
        label: 'Before Extract',
        description: 'Before data is pulled from the source',
        icon: <Database className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'extract', config: {} },
    },
    {
        key: 'afterExtract',
        label: 'After Extract',
        description: 'After data has been extracted',
        icon: <Database className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'extract', recordCount: 50, records: [{ id: 1 }] },
    },
    {
        key: 'beforeTransform',
        label: 'Before Transform',
        description: 'Before data transformation begins',
        icon: <Filter className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'transform', recordCount: 50 },
    },
    {
        key: 'afterTransform',
        label: 'After Transform',
        description: 'After data has been transformed',
        icon: <Filter className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'transform', recordCount: 48, dropped: 2 },
    },
    {
        key: 'beforeValidate',
        label: 'Before Validate',
        description: 'Before schema validation runs',
        icon: <CheckCircle2 className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'validate', schemaCode: 'product-schema' },
    },
    {
        key: 'afterValidate',
        label: 'After Validate',
        description: 'After validation completes',
        icon: <CheckCircle2 className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'validate', valid: 45, invalid: 3 },
    },
    {
        key: 'beforeEnrich',
        label: 'Before Enrich',
        description: 'Before data enrichment step',
        icon: <Zap className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'enrich' },
    },
    {
        key: 'afterEnrich',
        label: 'After Enrich',
        description: 'After data has been enriched',
        icon: <Zap className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'enrich', enrichedFields: ['category', 'price'] },
    },
    {
        key: 'beforeRoute',
        label: 'Before Route',
        description: 'Before records are routed to destinations',
        icon: <ArrowRight className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'route', recordCount: 45 },
    },
    {
        key: 'afterRoute',
        label: 'After Route',
        description: 'After routing decisions are made',
        icon: <ArrowRight className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'route', destinations: { products: 30, inventory: 15 } },
    },
    {
        key: 'beforeLoad',
        label: 'Before Load',
        description: 'Before data is written to destination',
        icon: <Upload className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'load', destination: 'vendure', recordCount: 45 },
    },
    {
        key: 'afterLoad',
        label: 'After Load',
        description: 'After data has been loaded',
        icon: <Upload className="w-4 h-4" />,
        category: 'data',
        examplePayload: { stepKey: 'load', created: 20, updated: 25, errors: 0 },
    },
    // Error handling hooks
    {
        key: 'onError',
        label: 'On Error',
        description: 'When any error occurs during processing',
        icon: <AlertTriangle className="w-4 h-4" />,
        category: 'error',
        examplePayload: { error: 'Validation failed', record: { id: 1 }, stepKey: 'validate' },
    },
    {
        key: 'onRetry',
        label: 'On Retry',
        description: 'When a failed record is retried',
        icon: <RefreshCw className="w-4 h-4" />,
        category: 'error',
        examplePayload: { errorId: '456', attempt: 2, maxAttempts: 3 },
    },
    {
        key: 'onDeadLetter',
        label: 'On Dead Letter',
        description: 'When a record is moved to dead letter queue',
        icon: <XCircle className="w-4 h-4" />,
        category: 'error',
        examplePayload: { errorId: '456', reason: 'Max retries exceeded', record: { id: 1 } },
    },
];

const STAGE_CATEGORIES = {
    lifecycle: { label: 'Lifecycle', color: 'bg-blue-100 text-blue-800' },
    data: { label: 'Data Processing', color: 'bg-green-100 text-green-800' },
    error: { label: 'Error Handling', color: 'bg-red-100 text-red-800' },
};

// MAIN PAGE

function HooksPage() {
    const [pipelineId, setPipelineId] = React.useState<string>('');
    const [selectedStage, setSelectedStage] = React.useState<HookStage | null>(null);
    const [testResult, setTestResult] = React.useState<'success' | 'error' | null>(null);
    const [eventFilter, setEventFilter] = React.useState('');

    const { data: pipelinesData } = useQuery({
        queryKey: ['DataHubPipesForHooks'],
        queryFn: () => api.query(pipelinesQuery, {}),
    });

    const { data: hooksData } = useQuery({
        queryKey: ['DataHubHooks', pipelineId],
        queryFn: () => api.query(hooksQuery, { pipelineId }),
        enabled: !!pipelineId,
    });

    const events = useQuery({
        queryKey: ['DataHubEvents'],
        queryFn: () => api.query(eventsQuery, { limit: UI_DEFAULTS.EVENTS_LIMIT }),
        refetchInterval: UI_DEFAULTS.AUTO_REFRESH_INTERVAL_MS / 2,
    });

    const testMutation = useMutation({
        mutationFn: (vars: { pipelineId: string; stage: string; payload?: unknown }) =>
            api.mutate(runHookTest, vars),
        onSuccess: () => {
            setTestResult('success');
            toast.success('Hook test executed successfully');
            events.refetch();
        },
        onError: (err: Error) => {
            setTestResult('error');
            toast.error('Hook test failed', { description: err.message });
        },
    });

    const hooks = hooksData?.dataHubPipelineHooks ?? {};
    const pipelines = pipelinesData?.dataHubPipelines.items ?? [];
    const selectedPipeline = pipelines.find(p => p.id === pipelineId);

    const runTest = (stage: HookStage) => {
        if (!pipelineId) {
            toast.error('Please select a pipeline first');
            return;
        }
        setSelectedStage(stage);
        setTestResult(null);
        testMutation.mutate({
            pipelineId,
            stage: stage.key,
            payload: stage.examplePayload,
        });
    };

    return (
        <Page pageId="data-hub-hooks">
            <PageActionBar>
                <PageActionBarRight>
                    <Button
                        variant="ghost"
                        onClick={() => events.refetch()}
                        disabled={events.isFetching}
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${events.isFetching ? 'animate-spin' : ''}`} />
                        Refresh Events
                    </Button>
                </PageActionBarRight>
            </PageActionBar>

            {/* Introduction Card */}
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

            {/* Hook Stages */}
            <PageBlock column="main" blockId="stages">
                <div className="mb-4">
                    <h3 className="text-lg font-semibold mb-1">Available Hook Stages</h3>
                    <p className="text-sm text-muted-foreground">
                        Click any hook to test it with sample data. Results will appear in the Events section below.
                    </p>
                </div>

                {/* Lifecycle Hooks */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Badge className={STAGE_CATEGORIES.lifecycle.color}>
                            {STAGE_CATEGORIES.lifecycle.label}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                            Track pipeline start, completion, and failure
                        </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        {HOOK_STAGES.filter(s => s.category === 'lifecycle').map(stage => (
                            <HookStageCard
                                key={stage.key}
                                stage={stage}
                                isConfigured={!!(hooks as Record<string, unknown>)[stage.key]}
                                isSelected={selectedStage?.key === stage.key}
                                isLoading={testMutation.isPending && selectedStage?.key === stage.key}
                                testResult={selectedStage?.key === stage.key ? testResult : null}
                                onTest={() => runTest(stage)}
                                disabled={!pipelineId}
                            />
                        ))}
                    </div>
                </div>

                {/* Data Processing Hooks */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Badge className={STAGE_CATEGORIES.data.color}>
                            {STAGE_CATEGORIES.data.label}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                            Intercept data at each processing step
                        </span>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                        {HOOK_STAGES.filter(s => s.category === 'data').map(stage => (
                            <HookStageCard
                                key={stage.key}
                                stage={stage}
                                isConfigured={!!(hooks as Record<string, unknown>)[stage.key]}
                                isSelected={selectedStage?.key === stage.key}
                                isLoading={testMutation.isPending && selectedStage?.key === stage.key}
                                testResult={selectedStage?.key === stage.key ? testResult : null}
                                onTest={() => runTest(stage)}
                                disabled={!pipelineId}
                            />
                        ))}
                    </div>
                </div>

                {/* Error Handling Hooks */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Badge className={STAGE_CATEGORIES.error.color}>
                            {STAGE_CATEGORIES.error.label}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                            Handle errors and retries
                        </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        {HOOK_STAGES.filter(s => s.category === 'error').map(stage => (
                            <HookStageCard
                                key={stage.key}
                                stage={stage}
                                isConfigured={!!(hooks as Record<string, unknown>)[stage.key]}
                                isSelected={selectedStage?.key === stage.key}
                                isLoading={testMutation.isPending && selectedStage?.key === stage.key}
                                testResult={selectedStage?.key === stage.key ? testResult : null}
                                onTest={() => runTest(stage)}
                                disabled={!pipelineId}
                            />
                        ))}
                    </div>
                </div>
            </PageBlock>

            {/* Configured Hooks JSON (collapsible for advanced users) */}
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

            {/* Recent Events */}
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
                            {(events.data?.dataHubEvents ?? [])
                                .filter(e => !eventFilter || (e.name ?? '').toLowerCase().includes(eventFilter.toLowerCase()))
                                .slice(0, 20)
                                .map((e, i) => (
                                    <tr key={i} className="border-t align-top hover:bg-muted/50">
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
                            {(events.data?.dataHubEvents ?? []).length === 0 && (
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

// HOOK STAGE CARD

function HookStageCard({
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
    return (
        <div
            className={`
                border rounded-lg p-3 transition-all cursor-pointer
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary hover:shadow-sm'}
                ${isSelected ? 'border-primary ring-1 ring-primary' : ''}
                ${isConfigured ? 'bg-primary/5' : ''}
            `}
            onClick={() => !disabled && onTest()}
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
}
