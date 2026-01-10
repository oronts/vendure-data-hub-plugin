import * as React from 'react';
import {
    Button,
    DashboardRouteDefinition,
    Input,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    PermissionGuard,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Badge,
    Json,
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerDescription,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@vendure/dashboard';
import { graphql } from '@/gql';
import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { DATAHUB_NAV_SECTION, POLLING_INTERVALS } from '../../constants/index';
import {
    AlertCircle,
    AlertTriangle,
    Bug,
    Info,
    RefreshCw,
    Search,
    Clock,
    Activity,
    TrendingUp,
    Filter,
    Download,
    Calendar,
    ChevronLeft,
    ChevronRight,
    BarChart3,
    FileText,
    Zap,
} from 'lucide-react';

// GRAPHQL QUERIES

const logsQuery = graphql(`
    query DataHubLogs($options: DataHubLogListOptions) {
        dataHubLogs(options: $options) {
            items {
                id
                createdAt
                level
                message
                stepKey
                context
                metadata
                pipelineId
                runId
                durationMs
                recordsProcessed
                recordsFailed
                pipeline { id code name }
            }
            totalItems
        }
    }
`);

const logStatsQuery = graphql(`
    query DataHubLogStats($pipelineId: ID) {
        dataHubLogStats(pipelineId: $pipelineId) {
            total
            byLevel { DEBUG INFO WARN ERROR }
            errorsToday
            warningsToday
            avgDurationMs
        }
    }
`);

const pipelinesQuery = graphql(`
    query DataHubPipelinesForLogs {
        dataHubPipelines(options: { take: 999 }) {
            items { id code name }
        }
    }
`);

const recentLogsQuery = graphql(`
    query DataHubRecentLogs($limit: Int) {
        dataHubRecentLogs(limit: $limit) {
            id
            createdAt
            level
            message
            stepKey
            pipeline { id code name }
            durationMs
            recordsProcessed
            recordsFailed
        }
    }
`);

// ROUTE DEFINITION

export const logsRoute: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-logs',
        url: '/data-hub/logs',
        title: 'Logs & Analytics',
    },
    path: '/data-hub/logs',
    loader: () => ({ breadcrumb: 'Logs & Analytics' }),
    component: () => (
        <PermissionGuard requires={['ViewDataHubRuns']}>
            <LogsPage />
        </PermissionGuard>
    ),
};

// MAIN PAGE COMPONENT

function LogsPage() {
    const [activeTab, setActiveTab] = React.useState('overview');

    return (
        <Page pageId="data-hub-logs">
            <PageActionBar>
                <PageActionBarRight />
            </PageActionBar>

            <PageBlock column="main" blockId="tabs">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="mb-4">
                        <TabsTrigger value="overview" className="gap-2">
                            <BarChart3 className="w-4 h-4" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger value="logs" className="gap-2">
                            <FileText className="w-4 h-4" />
                            Log Explorer
                        </TabsTrigger>
                        <TabsTrigger value="realtime" className="gap-2">
                            <Zap className="w-4 h-4" />
                            Real-time Feed
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview">
                        <OverviewTab />
                    </TabsContent>

                    <TabsContent value="logs">
                        <LogExplorerTab />
                    </TabsContent>

                    <TabsContent value="realtime">
                        <RealtimeTab />
                    </TabsContent>
                </Tabs>
            </PageBlock>
        </Page>
    );
}

// OVERVIEW TAB

function OverviewTab() {
    const { data: statsData, refetch: refetchStats, isLoading } = useQuery({
        queryKey: ['DataHubLogStats'],
        queryFn: () => api.query(logStatsQuery, {}),
        refetchInterval: POLLING_INTERVALS.LOGS,
    });

    const { data: pipelinesData } = useQuery({
        queryKey: ['DataHubPipelinesForLogs'],
        queryFn: () => api.query(pipelinesQuery, {}),
    });

    const stats = statsData?.dataHubLogStats;
    const pipelines = pipelinesData?.dataHubPipelines?.items ?? [];

    return (
        <div className="space-y-6">
            {/* Stats Dashboard */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity className="w-5 h-5 text-primary" />
                            <CardTitle>Analytics Dashboard</CardTitle>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => refetchStats()} disabled={isLoading}>
                            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                    <CardDescription>
                        Pipeline execution metrics and log statistics
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-5 gap-4">
                        <StatCard
                            label="Total Logs"
                            value={stats?.total ?? 0}
                            icon={<TrendingUp className="w-4 h-4" />}
                            color="text-blue-600"
                        />
                        <StatCard
                            label="Errors Today"
                            value={stats?.errorsToday ?? 0}
                            icon={<AlertCircle className="w-4 h-4" />}
                            color="text-red-600"
                            bgColor="bg-red-50"
                        />
                        <StatCard
                            label="Warnings Today"
                            value={stats?.warningsToday ?? 0}
                            icon={<AlertTriangle className="w-4 h-4" />}
                            color="text-amber-600"
                            bgColor="bg-amber-50"
                        />
                        <StatCard
                            label="Avg Duration"
                            value={`${stats?.avgDurationMs ?? 0}ms`}
                            icon={<Clock className="w-4 h-4" />}
                            color="text-green-600"
                        />
                        <div className="border rounded-lg p-3 bg-muted/30">
                            <div className="text-xs text-muted-foreground mb-2">By Level</div>
                            <div className="flex gap-2">
                                <LevelBadge level="DEBUG" count={stats?.byLevel?.DEBUG ?? 0} />
                                <LevelBadge level="INFO" count={stats?.byLevel?.INFO ?? 0} />
                                <LevelBadge level="WARN" count={stats?.byLevel?.WARN ?? 0} />
                                <LevelBadge level="ERROR" count={stats?.byLevel?.ERROR ?? 0} />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Per-Pipeline Stats */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Pipeline Health</CardTitle>
                    <CardDescription>
                        Log statistics for each pipeline
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                        {pipelines.slice(0, 6).map((p: any) => (
                            <PipelineStatCard key={p.id} pipeline={p} />
                        ))}
                    </div>
                    {pipelines.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                            No pipelines found
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function PipelineStatCard({ pipeline }: { pipeline: { id: string; code: string; name: string } }) {
    const { data } = useQuery({
        queryKey: ['DataHubLogStats', pipeline.id],
        queryFn: () => api.query(logStatsQuery, { pipelineId: pipeline.id }),
    });

    const stats = data?.dataHubLogStats;

    return (
        <div className="border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
                <div className="font-medium">{pipeline.name}</div>
                <code className="text-xs text-muted-foreground">{pipeline.code}</code>
            </div>
            <div className="flex gap-3 text-sm">
                <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{stats?.total ?? 0}</span> logs
                </span>
                {(stats?.errorsToday ?? 0) > 0 && (
                    <span className="text-red-600">
                        {stats?.errorsToday} errors today
                    </span>
                )}
                {(stats?.avgDurationMs ?? 0) > 0 && (
                    <span className="text-muted-foreground">
                        avg {stats?.avgDurationMs}ms
                    </span>
                )}
            </div>
        </div>
    );
}

// LOG EXPLORER TAB

function LogExplorerTab() {
    // Filter state
    const [pipelineId, setPipelineId] = React.useState<string>('');
    const [level, setLevel] = React.useState<string>('');
    const [search, setSearch] = React.useState<string>('');
    const [startDate, setStartDate] = React.useState<string>('');
    const [endDate, setEndDate] = React.useState<string>('');
    const [page, setPage] = React.useState(1);
    const [selectedLog, setSelectedLog] = React.useState<any>(null);
    const pageSize = 50;

    // Fetch pipelines for filter
    const { data: pipelinesData } = useQuery({
        queryKey: ['DataHubPipelinesForLogs'],
        queryFn: () => api.query(pipelinesQuery, {}),
    });

    // Build filter using Vendure's standard operators
    const buildFilter = () => {
        const filter: Record<string, any> = {};
        if (pipelineId) {
            filter.pipelineId = { eq: pipelineId };
        }
        if (level) {
            filter.level = { eq: level };
        }
        if (search) {
            filter.message = { contains: search };
        }
        if (startDate) {
            filter.createdAt = { ...(filter.createdAt || {}), after: new Date(startDate).toISOString() };
        }
        if (endDate) {
            filter.createdAt = { ...(filter.createdAt || {}), before: new Date(endDate).toISOString() };
        }
        return Object.keys(filter).length > 0 ? filter : undefined;
    };

    // Fetch logs
    const { data: logsData, isLoading, refetch } = useQuery({
        queryKey: ['DataHubLogs', pipelineId, level, search, startDate, endDate, page],
        queryFn: () =>
            api.query(logsQuery, {
                options: {
                    filter: buildFilter(),
                    sort: { createdAt: 'DESC' },
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                },
            }),
    });

    const logs = logsData?.dataHubLogs?.items ?? [];
    const totalItems = logsData?.dataHubLogs?.totalItems ?? 0;
    const totalPages = Math.ceil(totalItems / pageSize);
    const pipelines = pipelinesData?.dataHubPipelines?.items ?? [];

    const handleExport = () => {
        try {
            const data = logs.map((log: any) => ({
                timestamp: log.createdAt,
                level: log.level,
                pipeline: log.pipeline?.code ?? '',
                step: log.stepKey ?? '',
                message: log.message,
                duration: log.durationMs,
                recordsProcessed: log.recordsProcessed,
                recordsFailed: log.recordsFailed,
            }));
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `datahub-logs-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Logs exported successfully');
        } catch (e) {
            toast.error('Failed to export logs');
        }
    };

    return (
        <div className="space-y-4">
            {/* Filters */}
            <Card>
                <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Filter className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Filters</span>
                    </div>
                    <div className="grid grid-cols-6 gap-3">
                        <Select value={pipelineId || '__all__'} onValueChange={v => { setPipelineId(v === '__all__' ? '' : v); setPage(1); }}>
                            <SelectTrigger>
                                <SelectValue placeholder="All Pipelines" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">All Pipelines</SelectItem>
                                {pipelines.map((p: any) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={level || '__all__'} onValueChange={v => { setLevel(v === '__all__' ? '' : v); setPage(1); }}>
                            <SelectTrigger>
                                <SelectValue placeholder="All Levels" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">All Levels</SelectItem>
                                <SelectItem value="DEBUG">DEBUG</SelectItem>
                                <SelectItem value="INFO">INFO</SelectItem>
                                <SelectItem value="WARN">WARN</SelectItem>
                                <SelectItem value="ERROR">ERROR</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="relative">
                            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="date"
                                value={startDate}
                                onChange={e => { setStartDate(e.target.value); setPage(1); }}
                                className="pl-9"
                                placeholder="Start date"
                            />
                        </div>

                        <div className="relative">
                            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="date"
                                value={endDate}
                                onChange={e => { setEndDate(e.target.value); setPage(1); }}
                                className="pl-9"
                                placeholder="End date"
                            />
                        </div>

                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={e => { setSearch(e.target.value); setPage(1); }}
                                placeholder="Search logs..."
                                className="pl-9"
                            />
                        </div>

                        <div className="flex gap-2">
                            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}>
                                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button variant="outline" onClick={handleExport} disabled={logs.length === 0}>
                                <Download className="w-4 h-4 mr-2" />
                                Export
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Logs Table */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                            Log Entries ({totalItems.toLocaleString()})
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="text-sm text-muted-foreground">
                                Page {page} of {totalPages || 1}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                            >
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-muted">
                                    <th className="text-left px-3 py-2 w-36">Time</th>
                                    <th className="text-left px-3 py-2 w-20">Level</th>
                                    <th className="text-left px-3 py-2 w-32">Pipeline</th>
                                    <th className="text-left px-3 py-2 w-24">Step</th>
                                    <th className="text-left px-3 py-2">Message</th>
                                    <th className="text-right px-3 py-2 w-20">Duration</th>
                                    <th className="text-right px-3 py-2 w-24">Records</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log: any) => (
                                    <tr
                                        key={log.id}
                                        className="border-t hover:bg-muted/30 cursor-pointer"
                                        onClick={() => setSelectedLog(log)}
                                    >
                                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                            {formatTime(log.createdAt)}
                                        </td>
                                        <td className="px-3 py-2">
                                            <LogLevelBadge level={log.level} />
                                        </td>
                                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                                            {log.pipeline?.code ?? '—'}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                                            {log.stepKey ?? '—'}
                                        </td>
                                        <td className="px-3 py-2 max-w-[300px] truncate" title={log.message}>
                                            {log.message}
                                        </td>
                                        <td className="px-3 py-2 text-right text-muted-foreground">
                                            {log.durationMs != null ? `${log.durationMs}ms` : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {log.recordsProcessed != null ? (
                                                <span>
                                                    {log.recordsProcessed}
                                                    {log.recordsFailed > 0 && (
                                                        <span className="text-red-600 ml-1">
                                                            ({log.recordsFailed} failed)
                                                        </span>
                                                    )}
                                                </span>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                                            {isLoading ? 'Loading...' : 'No log entries found'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Log Details Drawer */}
            <LogDetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
        </div>
    );
}

// REALTIME TAB

function RealtimeTab() {
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['DataHubRecentLogs'],
        queryFn: () => api.query(recentLogsQuery, { limit: 50 }),
        refetchInterval: POLLING_INTERVALS.LIVE_LOGS,
    });

    const logs = data?.dataHubRecentLogs ?? [];

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-primary" />
                        <CardTitle>Real-time Log Feed</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`} />
                        <span className="text-sm text-muted-foreground">
                            Auto-refreshing every 3s
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>
                <CardDescription>
                    Latest log entries across all pipelines
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {logs.map((log: any) => (
                        <div
                            key={log.id}
                            className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/30"
                        >
                            <LogLevelBadge level={log.level} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-mono text-xs text-muted-foreground">
                                        {log.pipeline?.code ?? 'system'}
                                    </span>
                                    {log.stepKey && (
                                        <>
                                            <span className="text-muted-foreground">→</span>
                                            <span className="font-mono text-xs text-muted-foreground">
                                                {log.stepKey}
                                            </span>
                                        </>
                                    )}
                                    <span className="text-muted-foreground text-xs ml-auto">
                                        {formatTime(log.createdAt)}
                                    </span>
                                </div>
                                <div className="text-sm">{log.message}</div>
                                {(log.recordsProcessed != null || log.durationMs != null) && (
                                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                        {log.durationMs != null && (
                                            <span>{log.durationMs}ms</span>
                                        )}
                                        {log.recordsProcessed != null && (
                                            <span>
                                                {log.recordsProcessed} records
                                                {log.recordsFailed > 0 && (
                                                    <span className="text-red-600 ml-1">
                                                        ({log.recordsFailed} failed)
                                                    </span>
                                                )}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {logs.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                            No recent logs. Pipeline activity will appear here.
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

// LOG DETAIL DRAWER

function LogDetailDrawer({ log, onClose }: { log: any; onClose: () => void }) {
    return (
        <Drawer open={!!log} onOpenChange={open => !open && onClose()}>
            <DrawerContent>
                <DrawerHeader>
                    <DrawerTitle>Log Details</DrawerTitle>
                    <DrawerDescription>
                        {log?.createdAt ? new Date(log.createdAt).toLocaleString() : ''}
                    </DrawerDescription>
                </DrawerHeader>
                {log && (
                    <div className="p-4 space-y-4">
                        <div className="flex items-center gap-3">
                            <LogLevelBadge level={log.level} />
                            {log.pipeline && (
                                <Button asChild variant="link" size="sm" className="p-0 h-auto">
                                    <Link
                                        to="/data-hub/pipelines/$id"
                                        params={{ id: log.pipeline.id }}
                                    >
                                        {log.pipeline.name}
                                    </Link>
                                </Button>
                            )}
                        </div>

                        <div>
                            <div className="text-sm font-medium mb-1">Message</div>
                            <div className="p-3 bg-muted rounded-lg text-sm font-mono whitespace-pre-wrap">
                                {log.message}
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4">
                            <div>
                                <div className="text-xs text-muted-foreground">Step</div>
                                <div className="font-mono text-sm">{log.stepKey ?? '—'}</div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground">Duration</div>
                                <div className="text-sm">
                                    {log.durationMs != null ? `${log.durationMs}ms` : '—'}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground">Records Processed</div>
                                <div className="text-sm">{log.recordsProcessed ?? '—'}</div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground">Records Failed</div>
                                <div className={`text-sm ${log.recordsFailed > 0 ? 'text-red-600' : ''}`}>
                                    {log.recordsFailed ?? '—'}
                                </div>
                            </div>
                        </div>

                        {log.context && Object.keys(log.context).length > 0 && (
                            <div>
                                <div className="text-sm font-medium mb-1">Context</div>
                                <Json value={log.context} />
                            </div>
                        )}

                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <div>
                                <div className="text-sm font-medium mb-1">Metadata</div>
                                <Json value={log.metadata} />
                            </div>
                        )}

                        {log.runId && (
                            <div className="pt-3 border-t">
                                <Button asChild variant="outline" size="sm">
                                    <Link
                                        to="/data-hub/pipelines/$id"
                                        params={{ id: log.pipeline?.id ?? '' }}
                                    >
                                        View Pipeline
                                    </Link>
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </DrawerContent>
        </Drawer>
    );
}

// HELPER COMPONENTS

function StatCard({
    label,
    value,
    icon,
    color = 'text-foreground',
    bgColor = 'bg-muted/30',
}: Readonly<{
    label: string;
    value: string | number;
    icon: React.ReactNode;
    color?: string;
    bgColor?: string;
}>) {
    return (
        <div className={`border rounded-lg p-3 ${bgColor}`}>
            <div className="flex items-center gap-2 mb-1">
                <span className={color}>{icon}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <div className={`text-2xl font-semibold ${color}`}>{value}</div>
        </div>
    );
}

function LevelBadge({ level, count }: Readonly<{ level: string; count: number }>) {
    const colors: Record<string, string> = {
        DEBUG: 'bg-gray-100 text-gray-600',
        INFO: 'bg-blue-100 text-blue-600',
        WARN: 'bg-amber-100 text-amber-600',
        ERROR: 'bg-red-100 text-red-600',
    };
    return (
        <span className={`text-xs px-1.5 py-0.5 rounded ${colors[level] ?? 'bg-gray-100'}`}>
            {level.charAt(0)}: {count}
        </span>
    );
}

function LogLevelBadge({ level }: Readonly<{ level: string }>) {
    const config: Record<string, { icon: React.ReactNode; className: string }> = {
        DEBUG: { icon: <Bug className="w-3 h-3" />, className: 'bg-gray-100 text-gray-600' },
        INFO: { icon: <Info className="w-3 h-3" />, className: 'bg-blue-100 text-blue-600' },
        WARN: { icon: <AlertTriangle className="w-3 h-3" />, className: 'bg-amber-100 text-amber-600' },
        ERROR: { icon: <AlertCircle className="w-3 h-3" />, className: 'bg-red-100 text-red-600' },
    };
    const { icon, className } = config[level] ?? config.INFO;
    return (
        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${className}`}>
            {icon}
            {level}
        </span>
    );
}

function formatTime(isoDate: string): string {
    const date = new Date(isoDate);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
        return date.toLocaleTimeString();
    }
    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
