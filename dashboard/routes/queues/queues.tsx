import * as React from 'react';
import {
    DashboardRouteDefinition,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    Button,
    PermissionGuard,
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerDescription,
    Json,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Badge,
} from '@vendure/dashboard';
import { Link } from '@tanstack/react-router';
import { RefreshCw, AlertTriangle, Clock, CheckCircle, XCircle, Radio, Play, Square } from 'lucide-react';
import { StatCard, LoadingState, ErrorState } from '../../components/shared';
import { DATAHUB_NAV_SECTION, ROUTES, DATAHUB_PERMISSIONS } from '../../constants';
import {
    useQueueStats,
    useDeadLetters,
    useConsumers,
    useStartConsumer,
    useStopConsumer,
    useMarkDeadLetter,
    useRetryError,
    usePipelineRun,
} from '../../hooks';

// Types for memoized row components
interface FailedRun {
    id: string;
    code: string;
    finishedAt?: string | null;
    error?: string | null;
}

interface DeadLetter {
    id: string;
    stepKey: string;
    message: string;
    payload: unknown;
}

interface Consumer {
    pipelineCode: string;
    queueName: string;
    isActive: boolean;
    messagesProcessed: number;
    messagesFailed: number;
    lastMessageAt?: string | null;
}

// Memoized row component for failed runs
const FailedRunRow = React.memo(function FailedRunRow({
    run,
    onSelectRun,
}: {
    run: FailedRun;
    onSelectRun: (id: string) => void;
}) {
    const handleClick = React.useCallback(() => {
        onSelectRun(run.id);
    }, [run.id, onSelectRun]);

    return (
        <tr className="border-t align-top">
            <td className="px-3 py-2 font-mono text-muted-foreground">
                <button className="underline underline-offset-2 hover:text-foreground" onClick={handleClick}>
                    {run.id}
                </button>
            </td>
            <td className="px-3 py-2 font-mono text-muted-foreground">{run.code}</td>
            <td className="px-3 py-2">{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : '—'}</td>
            <td className="px-3 py-2 max-w-[640px] truncate" title={run.error ?? ''}>
                {run.error ?? '—'}
            </td>
        </tr>
    );
});

// Memoized row component for dead letters
const DeadLetterRow = React.memo(function DeadLetterRow({
    deadLetter,
    onRetry,
    onUnmark,
    isRetryPending,
    isUnmarkPending,
}: {
    deadLetter: DeadLetter;
    onRetry: (id: string) => void;
    onUnmark: (id: string) => void;
    isRetryPending: boolean;
    isUnmarkPending: boolean;
}) {
    const handleRetry = React.useCallback(() => {
        onRetry(deadLetter.id);
    }, [deadLetter.id, onRetry]);

    const handleUnmark = React.useCallback(() => {
        onUnmark(deadLetter.id);
    }, [deadLetter.id, onUnmark]);

    return (
        <tr className="border-t align-top">
            <td className="px-3 py-2 font-mono text-muted-foreground">{deadLetter.id}</td>
            <td className="px-3 py-2 font-mono text-muted-foreground">{deadLetter.stepKey}</td>
            <td className="px-3 py-2">{deadLetter.message}</td>
            <td className="px-3 py-2">
                <Json value={deadLetter.payload} />
            </td>
            <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                    <PermissionGuard requires={[DATAHUB_PERMISSIONS.REPLAY_RECORD]}>
                        <Button size="sm" variant="outline" onClick={handleRetry} disabled={isRetryPending}>
                            Replay
                        </Button>
                    </PermissionGuard>
                    <PermissionGuard requires={[DATAHUB_PERMISSIONS.EDIT_QUARANTINE]}>
                        <Button size="sm" variant="destructive" onClick={handleUnmark} disabled={isUnmarkPending}>
                            Unmark
                        </Button>
                    </PermissionGuard>
                </div>
            </td>
        </tr>
    );
});

// Memoized row component for consumers
const ConsumerRow = React.memo(function ConsumerRow({
    consumer,
    onStop,
    onStart,
    isStopPending,
    isStartPending,
}: {
    consumer: Consumer;
    onStop: (pipelineCode: string) => void;
    onStart: (pipelineCode: string) => void;
    isStopPending: boolean;
    isStartPending: boolean;
}) {
    const handleStop = React.useCallback(() => {
        onStop(consumer.pipelineCode);
    }, [consumer.pipelineCode, onStop]);

    const handleStart = React.useCallback(() => {
        onStart(consumer.pipelineCode);
    }, [consumer.pipelineCode, onStart]);

    return (
        <tr className="border-t align-top">
            <td className="px-3 py-2 font-mono text-muted-foreground">{consumer.pipelineCode}</td>
            <td className="px-3 py-2 font-mono text-muted-foreground text-xs">{consumer.queueName}</td>
            <td className="px-3 py-2">
                <Badge variant={consumer.isActive ? 'default' : 'secondary'}>
                    {consumer.isActive ? 'Active' : 'Stopped'}
                </Badge>
            </td>
            <td className="px-3 py-2">{consumer.messagesProcessed}</td>
            <td className="px-3 py-2">
                {consumer.messagesFailed > 0 ? (
                    <span className="text-destructive">{consumer.messagesFailed}</span>
                ) : (
                    consumer.messagesFailed
                )}
            </td>
            <td className="px-3 py-2">
                {consumer.lastMessageAt ? new Date(consumer.lastMessageAt).toLocaleString() : '—'}
            </td>
            <td className="px-3 py-2">
                <PermissionGuard requires={[DATAHUB_PERMISSIONS.UPDATE_PIPELINE]}>
                    {consumer.isActive ? (
                        <Button size="sm" variant="outline" onClick={handleStop} disabled={isStopPending}>
                            <Square className="w-3 h-3 mr-1" />
                            Stop
                        </Button>
                    ) : (
                        <Button size="sm" variant="outline" onClick={handleStart} disabled={isStartPending}>
                            <Play className="w-3 h-3 mr-1" />
                            Start
                        </Button>
                    )}
                </PermissionGuard>
            </td>
        </tr>
    );
});

export const queuesPage: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-queues',
        url: ROUTES.QUEUES,
        title: 'Queues',
    },
    path: ROUTES.QUEUES,
    loader: () => ({ breadcrumb: 'Queues' }),
    component: () => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.VIEW_RUNS]}>
            <QueuesPage />
        </PermissionGuard>
    ),
};

function QueuesPage() {
    const statsQuery = useQueueStats();
    const deadLettersQuery = useDeadLetters();
    const consumersQueryResult = useConsumers();
    const startConsumer = useStartConsumer();
    const stopConsumer = useStopConsumer();
    const mark = useMarkDeadLetter();
    const retry = useRetryError();

    const s = statsQuery.data;
    const deadLetters = deadLettersQuery.data ?? [];
    const consumers = consumersQueryResult.data ?? [];
    const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);

    const isLoading = statsQuery.isLoading && deadLettersQuery.isLoading && consumersQueryResult.isLoading;
    const hasError = statsQuery.isError || deadLettersQuery.isError || consumersQueryResult.isError;
    const errorMessage =
        statsQuery.error?.message || deadLettersQuery.error?.message || consumersQueryResult.error?.message;

    const runDetails = usePipelineRun(selectedRunId ?? undefined);

    const handleRefresh = React.useCallback(() => {
        statsQuery.refetch();
        deadLettersQuery.refetch();
        consumersQueryResult.refetch();
    }, [statsQuery, deadLettersQuery, consumersQueryResult]);

    // Callbacks for memoized row components
    const handleSelectRun = React.useCallback((runId: string) => {
        setSelectedRunId(runId);
    }, []);

    const handleRetryDeadLetter = React.useCallback(
        (errorId: string) => {
            retry.mutate({ errorId });
        },
        [retry],
    );

    const handleUnmarkDeadLetter = React.useCallback(
        (id: string) => {
            mark.mutate({ id, deadLetter: false });
        },
        [mark],
    );

    const handleStopConsumer = React.useCallback(
        (pipelineCode: string) => {
            stopConsumer.mutate({ pipelineCode });
        },
        [stopConsumer],
    );

    const handleStartConsumer = React.useCallback(
        (pipelineCode: string) => {
            startConsumer.mutate({ pipelineCode });
        },
        [startConsumer],
    );

    const handleDrawerOpenChange = React.useCallback((open: boolean) => {
        if (!open) {
            setSelectedRunId(null);
        }
    }, []);

    return (
        <Page pageId="data-hub-queues">
            <PageActionBar>
                <PageActionBarRight>
                    <Button variant="ghost" onClick={handleRefresh} disabled={statsQuery.isFetching || deadLettersQuery.isFetching}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                </PageActionBarRight>
            </PageActionBar>

            {hasError && (
                <PageBlock column="main" blockId="error">
                    <ErrorState
                        title="Failed to load queue data"
                        message={errorMessage || 'An unexpected error occurred'}
                        onRetry={handleRefresh}
                    />
                </PageBlock>
            )}

            {isLoading && !hasError && (
                <PageBlock column="main" blockId="loading">
                    <LoadingState type="card" rows={4} message="Loading queue data..." />
                </PageBlock>
            )}

            <PageBlock column="main" blockId="queues-tabs">
                <Tabs defaultValue="overview">
                    <TabsList>
                        <TabsTrigger value="overview">
                            <Clock className="w-4 h-4 mr-1" />
                            Queue Overview
                        </TabsTrigger>
                        <TabsTrigger value="dead-letters">
                            <AlertTriangle className="w-4 h-4 mr-1" />
                            Dead Letters
                            {deadLetters.length > 0 && (
                                <Badge variant="destructive" className="ml-2">{deadLetters.length}</Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="consumers">
                            <Radio className="w-4 h-4 mr-1" />
                            Consumers
                            {consumers.filter(c => c.isActive).length > 0 && (
                                <Badge variant="secondary" className="ml-2">{consumers.filter(c => c.isActive).length}</Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-4">
                        <div className="grid grid-cols-4 gap-3">
                            <StatCard title="Pending" value={s?.pending ?? 0} icon={<Clock className="w-4 h-4" />} />
                            <StatCard title="Running" value={s?.running ?? 0} icon={<RefreshCw className="w-4 h-4 animate-spin" />} />
                            <StatCard title="Failed" value={s?.failed ?? 0} icon={<XCircle className="w-4 h-4" />} variant="error" />
                            <StatCard title="Completed today" value={s?.completedToday ?? 0} icon={<CheckCircle className="w-4 h-4" />} variant="success" />
                        </div>

                        <div className="mt-6">
                            <div className="text-sm font-medium mb-2">Queue by Pipeline</div>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-muted">
                                        <th className="text-left px-3 py-2">Pipeline</th>
                                        <th className="text-left px-3 py-2">Pending</th>
                                        <th className="text-left px-3 py-2">Running</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(s?.byPipeline ?? []).map((r) => (
                                        <tr key={r.code} className="border-t">
                                            <td className="px-3 py-2 font-mono text-muted-foreground">{r.code}</td>
                                            <td className="px-3 py-2">{r.pending}</td>
                                            <td className="px-3 py-2">{r.running}</td>
                                        </tr>
                                    ))}
                                    {(s?.byPipeline ?? []).length === 0 && (
                                        <tr><td className="px-3 py-4 text-muted-foreground" colSpan={3}>No active pipelines</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-6">
                            <div className="text-sm font-medium mb-2">Recent Failed Runs</div>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-muted">
                                        <th className="text-left px-3 py-2">Run ID</th>
                                        <th className="text-left px-3 py-2">Pipeline</th>
                                        <th className="text-left px-3 py-2">Finished</th>
                                        <th className="text-left px-3 py-2">Error</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(s?.recentFailed ?? []).map((r) => (
                                        <FailedRunRow key={r.id} run={r} onSelectRun={handleSelectRun} />
                                    ))}
                                    {(s?.recentFailed ?? []).length === 0 && (
                                        <tr>
                                            <td className="px-3 py-4 text-muted-foreground" colSpan={4}>
                                                No recent failures
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </TabsContent>

                    <TabsContent value="dead-letters" className="mt-4">
                        <div className="mb-4">
                            <p className="text-sm text-muted-foreground">
                                Dead letters are records that failed processing and have been marked for manual review.
                            </p>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-muted">
                                    <th className="text-left px-3 py-2">ID</th>
                                    <th className="text-left px-3 py-2">Step</th>
                                    <th className="text-left px-3 py-2">Message</th>
                                    <th className="text-left px-3 py-2">Payload</th>
                                    <th className="text-left px-3 py-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {deadLetters.map((r) => (
                                    <DeadLetterRow
                                        key={r.id}
                                        deadLetter={r}
                                        onRetry={handleRetryDeadLetter}
                                        onUnmark={handleUnmarkDeadLetter}
                                        isRetryPending={retry.isPending}
                                        isUnmarkPending={mark.isPending}
                                    />
                                ))}
                                {deadLetters.length === 0 && (
                                    <tr>
                                        <td className="px-3 py-8 text-muted-foreground text-center" colSpan={5}>
                                            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                                            No dead letters
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </TabsContent>

                    <TabsContent value="consumers" className="mt-4">
                        <div className="mb-4">
                            <p className="text-sm text-muted-foreground">
                                Message queue consumers that process pipeline triggers. Start/stop consumers to manage message processing.
                            </p>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-muted">
                                    <th className="text-left px-3 py-2">Pipeline</th>
                                    <th className="text-left px-3 py-2">Queue</th>
                                    <th className="text-left px-3 py-2">Status</th>
                                    <th className="text-left px-3 py-2">Processed</th>
                                    <th className="text-left px-3 py-2">Failed</th>
                                    <th className="text-left px-3 py-2">Last Message</th>
                                    <th className="text-left px-3 py-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {consumers.map((c) => (
                                    <ConsumerRow
                                        key={c.pipelineCode}
                                        consumer={c}
                                        onStop={handleStopConsumer}
                                        onStart={handleStartConsumer}
                                        isStopPending={stopConsumer.isPending}
                                        isStartPending={startConsumer.isPending}
                                    />
                                ))}
                                {consumers.length === 0 && (
                                    <tr>
                                        <td className="px-3 py-8 text-muted-foreground text-center" colSpan={7}>
                                            <Radio className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                                            No message queue consumers configured
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </TabsContent>
                </Tabs>
            </PageBlock>

            <Drawer open={!!selectedRunId} onOpenChange={handleDrawerOpenChange}>
                <DrawerContent>
                    <DrawerHeader>
                        <DrawerTitle>Run Details</DrawerTitle>
                        <DrawerDescription>{selectedRunId ? `Run ${selectedRunId}` : '—'}</DrawerDescription>
                    </DrawerHeader>
                    <div className="p-4 space-y-3">
                        {runDetails.data ? (
                            <>
                                <div className="text-sm">Status: {runDetails.data?.status}</div>
                                <div className="text-sm text-muted-foreground">Pipeline: <span className="font-mono">{runDetails.data?.pipeline?.code ?? '—'}</span></div>
                                {runDetails.data?.pipeline?.id ? (
                                    <div>
                                        <Button asChild size="sm" variant="secondary">
                                            <Link to={`${ROUTES.PIPELINES}/$id`} params={{ id: String(runDetails.data?.pipeline.id) }} hash="runs">
                                                Open pipeline runs
                                            </Link>
                                        </Button>
                                    </div>
                                ) : null}
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                        <div className="text-muted-foreground">Started</div>
                                        <div>{runDetails.data?.startedAt ? new Date(String(runDetails.data?.startedAt)).toLocaleString() : '—'}</div>
                                    </div>
                                    <div>
                                        <div className="text-muted-foreground">Finished</div>
                                        <div>{runDetails.data?.finishedAt ? new Date(String(runDetails.data?.finishedAt)).toLocaleString() : '—'}</div>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm font-medium mb-1">Metrics</div>
                                    <Json value={runDetails.data?.metrics ?? {}} />
                                </div>
                                {runDetails.data?.error ? (
                                    <div>
                                        <div className="text-sm font-medium mb-1">Error</div>
                                        <pre className="bg-muted p-2 rounded text-xs overflow-auto">{runDetails.data?.error}</pre>
                                    </div>
                                ) : null}
                            </>
                        ) : (
                            <div className="text-sm text-muted-foreground">Loading...</div>
                        )}
                    </div>
                </DrawerContent>
            </Drawer>
        </Page>
    );
}
