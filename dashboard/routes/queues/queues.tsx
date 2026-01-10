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
import { graphql } from '@/gql';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { RefreshCw, AlertTriangle, Clock, CheckCircle, XCircle } from 'lucide-react';
import { DATAHUB_NAV_SECTION, POLLING_INTERVALS } from '../../constants/index';

const statsQuery = graphql(`
    query DataHubQueueStats { dataHubQueueStats { pending running failed completedToday byPipeline { code pending running } recentFailed { id code finishedAt error } } }
`);

const deadLettersQuery = graphql(`
    query DataHubDeadLetters { dataHubDeadLetters { id stepKey message payload } }
`);

const markDocument = graphql(`
    mutation MarkDataHubDeadLetter($id: ID!, $deadLetter: Boolean!) { markDataHubDeadLetter(id: $id, deadLetter: $deadLetter) }
`);

const retryDocument = graphql(`
    mutation RetryDataHubRecord($errorId: ID!, $patch: JSON) { retryDataHubRecord(errorId: $errorId, patch: $patch) }
`);

export const queuesRoute: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-queues',
        url: '/data-hub/queues',
        title: 'Queues',
    },
    path: '/data-hub/queues',
    loader: () => ({ breadcrumb: 'Queues' }),
    component: () => (
        <PermissionGuard requires={['ViewDataHubRuns']}>
            <QueuesPage />
        </PermissionGuard>
    ),
};

function QueuesPage() {
    const queryClient = useQueryClient();
    const query = useQuery({ queryKey: ['DataHubQueueStats'], queryFn: () => api.query(statsQuery, {}), refetchInterval: POLLING_INTERVALS.QUEUES });
    const deadLettersList = useQuery({ queryKey: ['DataHubDeadLetters'], queryFn: () => api.query(deadLettersQuery, {}) });
    const mark = useMutation({ mutationFn: (vars: { id: string; deadLetter: boolean }) => api.mutate(markDocument, vars), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['DataHubDeadLetters'] }) });
    const retry = useMutation({ mutationFn: (vars: { errorId: string }) => api.mutate(retryDocument, vars), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['DataHubDeadLetters'] }) });

    const s = query.data?.dataHubQueueStats;
    const deadLetters: Array<{ id: string; stepKey: string; message: string; payload: unknown }> = deadLettersList.data?.dataHubDeadLetters ?? [];
    const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);

    const runDetailsQuery = graphql(`
        query DataHubPipelineRunDetailForQueues($id: ID!) {
            dataHubPipelineRun(id: $id) {
                id
                status
                startedAt
                finishedAt
                metrics
                error
                pipeline { id code name }
            }
        }
    `);
    const runDetails = useQuery({ queryKey: ['DataHubPipelineRunDetailForQueues', selectedRunId], queryFn: () => api.query(runDetailsQuery, { id: selectedRunId! }), enabled: !!selectedRunId });

    const handleRefresh = () => {
        query.refetch();
        deadLettersList.refetch();
    };

    return (
        <Page pageId="data-hub-queues">
            <PageActionBar>
                <PageActionBarRight>
                    <Button variant="ghost" onClick={handleRefresh} disabled={query.isFetching || deadLettersList.isFetching}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                </PageActionBarRight>
            </PageActionBar>
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
                    </TabsList>

                    <TabsContent value="overview" className="mt-4">
                        {/* Stats Cards */}
                        <div className="grid grid-cols-4 gap-3">
                            <StatCard label="Pending" value={s?.pending ?? 0} icon={<Clock className="w-4 h-4" />} />
                            <StatCard label="Running" value={s?.running ?? 0} icon={<RefreshCw className="w-4 h-4 animate-spin" />} />
                            <StatCard label="Failed" value={s?.failed ?? 0} icon={<XCircle className="w-4 h-4 text-destructive" />} />
                            <StatCard label="Completed today" value={s?.completedToday ?? 0} icon={<CheckCircle className="w-4 h-4 text-green-500" />} />
                        </div>

                        {/* By Pipeline Table */}
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
                                    {(s?.byPipeline ?? []).map((r: any) => (
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

                        {/* Recent Failed Runs */}
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
                                    {(s?.recentFailed ?? []).map((r: any) => (
                                        <tr key={r.id} className="border-t align-top">
                                            <td className="px-3 py-2 font-mono text-muted-foreground">
                                                <button className="underline underline-offset-2 hover:text-foreground" onClick={() => setSelectedRunId(r.id)}>{r.id}</button>
                                            </td>
                                            <td className="px-3 py-2 font-mono text-muted-foreground">{r.code}</td>
                                            <td className="px-3 py-2">{r.finishedAt ? new Date(r.finishedAt).toLocaleString() : '—'}</td>
                                            <td className="px-3 py-2 max-w-[640px] truncate" title={r.error ?? ''}>{r.error ?? '—'}</td>
                                        </tr>
                                    ))}
                                    {((s?.recentFailed ?? []).length === 0) && (
                                        <tr><td className="px-3 py-4 text-muted-foreground" colSpan={4}>No recent failures</td></tr>
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
                                {deadLetters.map(r => (
                                    <tr key={r.id} className="border-t align-top">
                                        <td className="px-3 py-2 font-mono text-muted-foreground">{r.id}</td>
                                        <td className="px-3 py-2 font-mono text-muted-foreground">{r.stepKey}</td>
                                        <td className="px-3 py-2">{r.message}</td>
                                        <td className="px-3 py-2"><Json value={r.payload} /></td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-2">
                                                <PermissionGuard requires={['ReplayRecord']}>
                                                    <Button size="sm" variant="outline" onClick={() => retry.mutate({ errorId: r.id })} disabled={retry.isPending}>
                                                        Replay
                                                    </Button>
                                                </PermissionGuard>
                                                <PermissionGuard requires={['EditQuarantine']}>
                                                    <Button size="sm" variant="destructive" onClick={() => mark.mutate({ id: r.id, deadLetter: false })} disabled={mark.isPending}>
                                                        Unmark
                                                    </Button>
                                                </PermissionGuard>
                                            </div>
                                        </td>
                                    </tr>
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
                </Tabs>
            </PageBlock>

            {/* Run Details Drawer */}
            <Drawer open={!!selectedRunId} onOpenChange={open => !open && setSelectedRunId(null)}>
                <DrawerContent>
                    <DrawerHeader>
                        <DrawerTitle>Run Details</DrawerTitle>
                        <DrawerDescription>{selectedRunId ? `Run ${selectedRunId}` : '—'}</DrawerDescription>
                    </DrawerHeader>
                    <div className="p-4 space-y-3">
                        {runDetails.data?.dataHubPipelineRun ? (
                            <>
                                <div className="text-sm">Status: {runDetails.data.dataHubPipelineRun.status}</div>
                                <div className="text-sm text-muted-foreground">Pipeline: <span className="font-mono">{runDetails.data.dataHubPipelineRun.pipeline?.code ?? '—'}</span></div>
                                {runDetails.data.dataHubPipelineRun.pipeline?.id ? (
                                    <div>
                                        <Button asChild size="sm" variant="secondary">
                                            <Link to="/data-hub/pipelines/$id" params={{ id: runDetails.data.dataHubPipelineRun.pipeline.id as any }} hash="runs">
                                                Open pipeline runs
                                            </Link>
                                        </Button>
                                    </div>
                                ) : null}
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                        <div className="text-muted-foreground">Started</div>
                                        <div>{runDetails.data.dataHubPipelineRun.startedAt ? new Date(runDetails.data.dataHubPipelineRun.startedAt as any).toLocaleString() : '—'}</div>
                                    </div>
                                    <div>
                                        <div className="text-muted-foreground">Finished</div>
                                        <div>{runDetails.data.dataHubPipelineRun.finishedAt ? new Date(runDetails.data.dataHubPipelineRun.finishedAt as any).toLocaleString() : '—'}</div>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm font-medium mb-1">Metrics</div>
                                    <Json value={runDetails.data.dataHubPipelineRun.metrics ?? {}} />
                                </div>
                                {runDetails.data.dataHubPipelineRun.error ? (
                                    <div>
                                        <div className="text-sm font-medium mb-1">Error</div>
                                        <pre className="bg-muted p-2 rounded text-xs overflow-auto">{runDetails.data.dataHubPipelineRun.error}</pre>
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

function StatCard({ label, value, icon }: Readonly<{ label: string; value: number; icon?: React.ReactNode }>) {
    return (
        <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">{label}</div>
                {icon}
            </div>
            <div className="text-2xl font-semibold mt-1">{value}</div>
        </div>
    );
}
