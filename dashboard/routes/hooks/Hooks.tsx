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
    CheckCircle2,
    XCircle,
    Info,
    Clock,
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
import { HOOK_STAGES } from './hook-stages';
import type { HookStage } from './hook-stages';

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

    const runTest = React.useCallback((stage: HookStage) => {
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
    }, [pipelineId, testMutation.mutate, eventsQuery.refetch]);

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

    const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!disabled) {
                onTest();
            }
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
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label={`Configure ${stage.label} hook stage`}
            aria-disabled={disabled}
        >
            <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded ${isConfigured ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        <stage.icon className="w-4 h-4" />
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
