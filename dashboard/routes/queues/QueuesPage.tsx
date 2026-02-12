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
import { RefreshCw, AlertTriangle, Clock, CheckCircle, XCircle, Radio } from 'lucide-react';
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
import { FailedRunsTable } from './FailedRunsTable';
import { DeadLettersTable } from './DeadLettersTable';
import { ConsumersTable } from './ConsumersTable';

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

    const stats = statsQuery.data;
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
    }, [statsQuery.refetch, deadLettersQuery.refetch, consumersQueryResult.refetch]);

    // Callbacks for memoized row components
    const handleSelectRun = React.useCallback((runId: string) => {
        setSelectedRunId(runId);
    }, []);

    const handleRetryDeadLetter = React.useCallback(
        (errorId: string) => {
            retry.mutate({ errorId });
        },
        [retry.mutate],
    );

    const handleUnmarkDeadLetter = React.useCallback(
        (id: string) => {
            mark.mutate({ id, deadLetter: false });
        },
        [mark.mutate],
    );

    const handleStopConsumer = React.useCallback(
        (pipelineCode: string) => {
            stopConsumer.mutate({ pipelineCode });
        },
        [stopConsumer.mutate],
    );

    const handleStartConsumer = React.useCallback(
        (pipelineCode: string) => {
            startConsumer.mutate({ pipelineCode });
        },
        [startConsumer.mutate],
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
                            <StatCard title="Pending" value={stats?.pending ?? 0} icon={<Clock className="w-4 h-4" />} />
                            <StatCard title="Running" value={stats?.running ?? 0} icon={<RefreshCw className="w-4 h-4 animate-spin" />} />
                            <StatCard title="Failed" value={stats?.failed ?? 0} icon={<XCircle className="w-4 h-4" />} variant="error" />
                            <StatCard title="Completed today" value={stats?.completedToday ?? 0} icon={<CheckCircle className="w-4 h-4" />} variant="success" />
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
                                    {(stats?.byPipeline ?? []).map((r) => (
                                        <tr key={r.code} className="border-t">
                                            <td className="px-3 py-2 font-mono text-muted-foreground">{r.code}</td>
                                            <td className="px-3 py-2">{r.pending}</td>
                                            <td className="px-3 py-2">{r.running}</td>
                                        </tr>
                                    ))}
                                    {(stats?.byPipeline ?? []).length === 0 && (
                                        <tr><td className="px-3 py-4 text-muted-foreground" colSpan={3}>No active pipelines</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <FailedRunsTable
                            recentFailed={stats?.recentFailed ?? []}
                            onSelectRun={handleSelectRun}
                        />
                    </TabsContent>

                    <TabsContent value="dead-letters" className="mt-4">
                        <DeadLettersTable
                            deadLetters={deadLetters}
                            onRetry={handleRetryDeadLetter}
                            onUnmark={handleUnmarkDeadLetter}
                            isRetryPending={retry.isPending}
                            isUnmarkPending={mark.isPending}
                        />
                    </TabsContent>

                    <TabsContent value="consumers" className="mt-4">
                        <ConsumersTable
                            consumers={consumers}
                            onStop={handleStopConsumer}
                            onStart={handleStartConsumer}
                            isStopPending={stopConsumer.isPending}
                            isStartPending={startConsumer.isPending}
                        />
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
