import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    DashboardRouteDefinition,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    PageLayout,
    PageTitle,
    Button,
    buttonVariants,
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
    usePermissions,
} from '@vendure/dashboard';
import { Link } from '@tanstack/react-router';
import { RefreshCw, AlertTriangle, Clock, CheckCircle, XCircle, Radio } from 'lucide-react';
import { StatCard, LoadingState, ErrorState } from '../../components/shared';
import { formatDateTime } from '../../utils';
import {
    DATAHUB_NAV_LABELS,
    DATAHUB_NAV_SECTION,
    ROUTES,
    DATAHUB_PERMISSIONS,
} from '../../constants';
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
import { localizeQueueRunStatus } from './queue-localization';

export const queuesPage: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-queues',
        url: ROUTES.QUEUES,
        title: DATAHUB_NAV_LABELS.QUEUES,
        requiresPermission: DATAHUB_PERMISSIONS.VIEW_RUNS,
    },
    path: ROUTES.QUEUES,
    loader: () => ({ breadcrumb: DATAHUB_NAV_LABELS.QUEUES }),
    component: () => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.VIEW_RUNS]}>
            <QueuesPage />
        </PermissionGuard>
    ),
};

function QueuesPage() {
    const { hasPermissions } = usePermissions();
    const canViewQuarantine = hasPermissions([DATAHUB_PERMISSIONS.VIEW_QUARANTINE]);
    const statsQuery = useQueueStats();
    const deadLettersQuery = useDeadLetters(canViewQuarantine);
    const { i18n, t } = useLingui();
    const consumersQueryResult = useConsumers();
    const startConsumer = useStartConsumer();
    const stopConsumer = useStopConsumer();
    const mark = useMarkDeadLetter();
    const retry = useRetryError();
    const { refetch: refetchStats } = statsQuery;
    const { refetch: refetchDeadLetters } = deadLettersQuery;
    const { refetch: refetchConsumers } = consumersQueryResult;
    const { mutate: retryDeadLetter } = retry;
    const { mutate: markDeadLetter } = mark;
    const { mutate: stopQueueConsumer } = stopConsumer;
    const { mutate: startQueueConsumer } = startConsumer;

    const stats = statsQuery.data;
    const recentFailed = React.useMemo(
        () => (stats?.recentFailed ?? []).map(run => ({ ...run, id: String(run.id) })),
        [stats?.recentFailed],
    );
    const deadLetters = React.useMemo(
        () => (deadLettersQuery.data?.pages ?? [])
            .flatMap(page => page.items)
            .map(entry => ({ ...entry, id: String(entry.id) })),
        [deadLettersQuery.data],
    );
    const totalDeadLetters = deadLettersQuery.data?.pages[0]?.totalItems ?? 0;
    const consumers = consumersQueryResult.data ?? [];
    const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);

    const isLoading = statsQuery.isLoading || (canViewQuarantine && deadLettersQuery.isLoading) || consumersQueryResult.isLoading;
    const hasError = statsQuery.isError || (canViewQuarantine && deadLettersQuery.isError) || consumersQueryResult.isError;
    const errorMessage = statsQuery.error?.message ||
        (canViewQuarantine ? deadLettersQuery.error?.message : undefined) ||
        consumersQueryResult.error?.message;

    const runDetails = usePipelineRun(selectedRunId ?? undefined);

    const handleRefresh = React.useCallback(() => {
        void refetchStats();
        if (canViewQuarantine) void refetchDeadLetters();
        void refetchConsumers();
    }, [canViewQuarantine, refetchConsumers, refetchDeadLetters, refetchStats]);

    // Callbacks for memoized row components
    const handleSelectRun = React.useCallback((runId: string) => {
        setSelectedRunId(runId);
    }, []);

    const handleRetryDeadLetter = React.useCallback(
        (errorId: string) => {
            retryDeadLetter({ errorId });
        },
        [retryDeadLetter],
    );

    const handleUnmarkDeadLetter = React.useCallback(
        (id: string) => {
            markDeadLetter({ id, deadLetter: false });
        },
        [markDeadLetter],
    );

    const handleStopConsumer = React.useCallback(
        (pipelineCode: string, triggerKey: string) => {
            stopQueueConsumer({ pipelineCode, triggerKey });
        },
        [stopQueueConsumer],
    );

    const handleStartConsumer = React.useCallback(
        (pipelineCode: string, triggerKey: string) => {
            startQueueConsumer({ pipelineCode, triggerKey });
        },
        [startQueueConsumer],
    );

    const handleDrawerOpenChange = React.useCallback((open: boolean) => {
        if (!open) {
            setSelectedRunId(null);
        }
    }, []);

    const activeConsumerCount = consumers.filter(c => c.isActive).length;

    return (
        <Page pageId="data-hub-queues">
            <PageTitle><Trans>Queues</Trans></PageTitle>
            <PageActionBar>
                <PageActionBarRight>
                    <Button
                        variant="ghost"
                        onClick={handleRefresh}
                        disabled={
                            statsQuery.isFetching ||
                            deadLettersQuery.isFetching ||
                            consumersQueryResult.isFetching
                        }
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        <Trans>Refresh</Trans>
                    </Button>
                </PageActionBarRight>
            </PageActionBar>

            <PageLayout>
            {hasError && (
                <PageBlock column="main" blockId="error">
                    <ErrorState
                        title={t`Failed to load queue data`}
                        message={errorMessage || t`An unexpected error occurred`}
                        onRetry={handleRefresh}
                    />
                </PageBlock>
            )}

            {isLoading && !hasError && (
                <PageBlock column="main" blockId="loading">
                    <LoadingState type="card" rows={4} message={t`Loading queue data...`} />
                </PageBlock>
            )}

            {!isLoading && !hasError && (
                <PageBlock column="main" blockId="queues-tabs">
                    <Tabs defaultValue="overview">
                    <TabsList className="max-w-full justify-start overflow-x-auto">
                        <TabsTrigger value="overview">
                            <Clock className="w-4 h-4 mr-1" />
                            <Trans>Queue Overview</Trans>
                        </TabsTrigger>
                        {canViewQuarantine && (
                            <TabsTrigger value="dead-letters">
                                <AlertTriangle className="w-4 h-4 mr-1" />
                                <Trans>Dead Letters</Trans>
                                {deadLetters.length > 0 && (
                                    <Badge variant="destructive" className="ml-2">{deadLetters.length}</Badge>
                                )}
                            </TabsTrigger>
                        )}
                        <TabsTrigger value="consumers">
                            <Radio className="w-4 h-4 mr-1" />
                            <Trans>Consumers</Trans>
                            {activeConsumerCount > 0 && (
                                <Badge variant="secondary" className="ml-2">{activeConsumerCount}</Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <StatCard title={t`Pending`} value={stats?.pending ?? 0} icon={<Clock className="w-4 h-4" />} />
                            <StatCard title={t`Running`} value={stats?.running ?? 0} icon={<RefreshCw className={`w-4 h-4 ${(stats?.running ?? 0) > 0 ? 'animate-spin' : ''}`} />} />
                            <StatCard title={t`Failed`} value={stats?.failed ?? 0} icon={<XCircle className="w-4 h-4" />} variant="error" />
                            <StatCard title={t`Completed today`} value={stats?.completedToday ?? 0} icon={<CheckCircle className="w-4 h-4" />} variant="success" />
                        </div>

                        <div className="mt-6">
                            <div className="text-sm font-medium mb-2"><Trans>Queue by Pipeline</Trans></div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <caption className="sr-only"><Trans>Queue statistics by pipeline</Trans></caption>
                                    <thead>
                                        <tr className="bg-muted">
                                            <th scope="col" className="text-left px-3 py-2">
                                                <Trans>Pipeline</Trans>
                                            </th>
                                            <th scope="col" className="text-left px-3 py-2">
                                                <Trans>Pending</Trans>
                                            </th>
                                            <th scope="col" className="text-left px-3 py-2">
                                                <Trans>Running</Trans>
                                            </th>
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
                                            <tr><td className="px-3 py-4 text-muted-foreground" colSpan={3}><Trans>No active pipelines</Trans></td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <FailedRunsTable
                            recentFailed={recentFailed}
                            onSelectRun={handleSelectRun}
                        />
                    </TabsContent>

                    {canViewQuarantine && (
                        <TabsContent value="dead-letters" className="mt-4">
                            <DeadLettersTable
                                deadLetters={deadLetters}
                                totalItems={totalDeadLetters}
                                hasNextPage={deadLettersQuery.hasNextPage}
                                isFetchingNextPage={deadLettersQuery.isFetchingNextPage}
                                onLoadMore={() => void deadLettersQuery.fetchNextPage()}
                                onRetry={handleRetryDeadLetter}
                                onUnmark={handleUnmarkDeadLetter}
                                isRetryPending={retry.isPending}
                                isUnmarkPending={mark.isPending}
                            />
                        </TabsContent>
                    )}

                    <TabsContent value="consumers" className="mt-4">
                        <ConsumersTable
                            consumers={consumers}
                            onStop={handleStopConsumer}
                            onStart={handleStartConsumer}
                            pendingStop={stopConsumer.isPending
                                ? stopConsumer.variables
                                : undefined}
                            pendingStart={startConsumer.isPending
                                ? startConsumer.variables
                                : undefined}
                        />
                    </TabsContent>
                    </Tabs>
                </PageBlock>
            )}
            </PageLayout>

            <Drawer open={!!selectedRunId} onOpenChange={handleDrawerOpenChange}>
                <DrawerContent>
                    <DrawerHeader>
                        <DrawerTitle><Trans>Run Details</Trans></DrawerTitle>
                        <DrawerDescription>{selectedRunId ? <Trans>Run {selectedRunId}</Trans> : '—'}</DrawerDescription>
                    </DrawerHeader>
                    <div className="p-4 space-y-3">
                        {runDetails.isError ? (
                            <div className="p-4 text-center text-sm text-destructive">
                                <Trans>Failed to load run details.</Trans>{' '}
                                <Button variant="link" className="p-0 h-auto" onClick={() => runDetails.refetch()}><Trans>Retry</Trans></Button>
                            </div>
                        ) : runDetails.data ? (
                            <>
                                <div className="text-sm"><Trans>Status</Trans>: {localizeQueueRunStatus(String(runDetails.data.status), id => i18n._(id))}</div>
                                <div className="text-sm text-muted-foreground"><Trans>Pipeline</Trans>: <span className="font-mono">{runDetails.data?.pipeline?.code ?? '—'}</span></div>
                                {runDetails.data?.pipeline?.id ? (
                                    <div>
                                        <Link
                                            className={buttonVariants({ size: 'sm', variant: 'secondary' })}
                                            to={`${ROUTES.PIPELINES}/$id`}
                                            params={{ id: String(runDetails.data?.pipeline.id) }}
                                            hash="runs"
                                        >
                                            <Trans>Open pipeline runs</Trans>
                                        </Link>
                                    </div>
                                ) : null}
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                        <div className="text-muted-foreground"><Trans>Started</Trans></div>
                                        <div>{runDetails.data?.startedAt ? formatDateTime(String(runDetails.data?.startedAt), undefined, i18n.locale) : '—'}</div>
                                    </div>
                                    <div>
                                        <div className="text-muted-foreground"><Trans>Finished</Trans></div>
                                        <div>{runDetails.data?.finishedAt ? formatDateTime(String(runDetails.data?.finishedAt), undefined, i18n.locale) : '—'}</div>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm font-medium mb-1"><Trans>Metrics</Trans></div>
                                    <Json value={runDetails.data?.metrics ?? {}} />
                                </div>
                                {runDetails.data?.error ? (
                                    <div>
                                        <div className="text-sm font-medium mb-1"><Trans>Error</Trans></div>
                                        <pre className="bg-muted p-2 rounded text-xs overflow-auto">{runDetails.data?.error}</pre>
                                    </div>
                                ) : null}
                            </>
                        ) : (
                            <div className="text-sm text-muted-foreground"><Trans>Loading...</Trans></div>
                        )}
                    </div>
                </DrawerContent>
            </Drawer>
        </Page>
    );
}
