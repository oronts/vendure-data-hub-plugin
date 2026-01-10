import * as React from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Badge,
    Button,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    ScrollArea,
    Input,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@vendure/dashboard';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    BarChart3,
    CheckCircle,
    Clock,
    Database,
    FileText,
    Filter,
    Info,
    RefreshCw,
    Search,
    TrendingDown,
    TrendingUp,
    XCircle,
    Zap,
} from 'lucide-react';
import { graphql } from '@/gql';
import { api } from '@vendure/dashboard';
import { UI_DEFAULTS } from '../../constants/index';

// GRAPHQL QUERIES

const logStatsQuery = graphql(`
    query GetDataHubLogStats($pipelineId: ID) {
        dataHubLogStats(pipelineId: $pipelineId) {
            total
            byLevel {
                DEBUG
                INFO
                WARN
                ERROR
            }
            errorsToday
            warningsToday
            avgDurationMs
        }
    }
`);

const recentLogsQuery = graphql(`
    query GetRecentDataHubLogs($limit: Int) {
        dataHubRecentLogs(limit: $limit) {
            id
            createdAt
            level
            message
            stepKey
            pipelineId
            runId
            durationMs
            recordsProcessed
            recordsFailed
        }
    }
`);

const searchLogsQuery = graphql(`
    query SearchDataHubLogs($options: DataHubLogListOptions) {
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
            }
            totalItems
        }
    }
`);

const queueStatsQuery = graphql(`
    query GetQueueStats {
        dataHubQueueStats {
            pending
            running
            failed
            completedToday
            byPipeline {
                code
                pending
                running
            }
            recentFailed {
                id
                code
                finishedAt
                error
            }
        }
    }
`);

// TYPES

interface LogEntry {
    id: string;
    createdAt: string;
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    message: string;
    stepKey?: string;
    pipelineId?: string;
    runId?: string;
    durationMs?: number;
    recordsProcessed?: number;
    recordsFailed?: number;
    context?: any;
    metadata?: any;
}

interface LogStats {
    total: number;
    byLevel: {
        DEBUG: number;
        INFO: number;
        WARN: number;
        ERROR: number;
    };
    errorsToday: number;
    warningsToday: number;
    avgDurationMs: number;
}

interface QueueStats {
    pending: number;
    running: number;
    failed: number;
    completedToday: number;
    byPipeline: Array<{ code: string; pending: number; running: number }>;
    recentFailed: Array<{ id: string; code: string; finishedAt: string; error: string }>;
}

// COMPONENTS

const LOG_LEVEL_CONFIG = {
    DEBUG: { icon: Info, color: 'text-gray-500', bg: 'bg-gray-100' },
    INFO: { icon: CheckCircle, color: 'text-blue-500', bg: 'bg-blue-100' },
    WARN: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-100' },
    ERROR: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100' },
};

function LogLevelBadge({ level }: { level: LogEntry['level'] }) {
    const config = LOG_LEVEL_CONFIG[level];
    const Icon = config.icon;
    return (
        <Badge className={`${config.bg} ${config.color} border-0`}>
            <Icon className="w-3 h-3 mr-1" />
            {level}
        </Badge>
    );
}

export function AnalyticsPanel() {
    type AnalyticsTab = 'overview' | 'logs' | 'queue';
    const [activeTab, setActiveTab] = React.useState<AnalyticsTab>('overview');
    const [stats, setStats] = React.useState<LogStats | null>(null);
    const [queueStats, setQueueStats] = React.useState<QueueStats | null>(null);
    const [logs, setLogs] = React.useState<LogEntry[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [levelFilter, setLevelFilter] = React.useState<string>('all');
    const [autoRefresh, setAutoRefresh] = React.useState(true);

    const loadData = React.useCallback(async () => {
        try {
            const [statsRes, logsRes, queueRes] = await Promise.all([
                api.query(logStatsQuery, {}),
                api.query(recentLogsQuery, { limit: UI_DEFAULTS.RECENT_LOGS_LIMIT }),
                api.query(queueStatsQuery),
            ]);

            setStats(statsRes?.dataHubLogStats ?? null);
            setLogs(logsRes?.dataHubRecentLogs ?? []);
            setQueueStats(queueRes?.dataHubQueueStats ?? null);
        } catch {
            // Analytics loading failed - silent failure to avoid disrupting the UI
            // Stats will show as null/empty which is handled by the components
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        loadData();
    }, [loadData]);

    React.useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(loadData, UI_DEFAULTS.AUTO_REFRESH_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [autoRefresh, loadData]);

    const handleSearch = async () => {
        setLoading(true);
        try {
            // Build filter using Vendure's standard operators
            const filter: Record<string, any> = {};
            if (searchTerm) {
                filter.message = { contains: searchTerm };
            }
            if (levelFilter !== 'all') {
                filter.level = { eq: levelFilter };
            }
            const res = await api.query(searchLogsQuery, {
                options: {
                    filter: Object.keys(filter).length > 0 ? filter : undefined,
                    sort: { createdAt: 'DESC' },
                    take: UI_DEFAULTS.PAGE_SIZE,
                },
            });
            setLogs(res?.dataHubLogs?.items ?? []);
        } finally {
            setLoading(false);
        }
    };

    const filteredLogs = logs.filter(log => {
        if (levelFilter !== 'all' && log.level !== levelFilter) return false;
        if (searchTerm && !log.message.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        return true;
    });

    return (
        <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as AnalyticsTab)}>
                <div className="flex items-center justify-between">
                    <TabsList>
                        <TabsTrigger value="overview">
                            <BarChart3 className="w-4 h-4 mr-2" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger value="logs">
                            <FileText className="w-4 h-4 mr-2" />
                            Logs
                        </TabsTrigger>
                        <TabsTrigger value="queue">
                            <Activity className="w-4 h-4 mr-2" />
                            Queue
                        </TabsTrigger>
                    </TabsList>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={loadData}
                            disabled={loading}
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                </div>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-6">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-4 gap-4">
                        <StatCard
                            title="Total Logs"
                            value={stats?.total ?? 0}
                            icon={<FileText className="w-5 h-5" />}
                            color="blue"
                        />
                        <StatCard
                            title="Errors Today"
                            value={stats?.errorsToday ?? 0}
                            icon={<XCircle className="w-5 h-5" />}
                            color="red"
                            trend={stats?.errorsToday && stats.errorsToday > 0 ? 'up' : undefined}
                        />
                        <StatCard
                            title="Warnings Today"
                            value={stats?.warningsToday ?? 0}
                            icon={<AlertTriangle className="w-5 h-5" />}
                            color="yellow"
                        />
                        <StatCard
                            title="Avg Duration"
                            value={`${stats?.avgDurationMs ?? 0}ms`}
                            icon={<Clock className="w-5 h-5" />}
                            color="green"
                        />
                    </div>

                    {/* Log Level Distribution */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Log Level Distribution</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex gap-4">
                                {stats && Object.entries(stats.byLevel).map(([level, count]) => {
                                    const config = LOG_LEVEL_CONFIG[level as keyof typeof LOG_LEVEL_CONFIG];
                                    const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                                    return (
                                        <div key={level} className="flex-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className={`text-sm font-medium ${config.color}`}>{level}</span>
                                                <span className="text-sm text-muted-foreground">{count}</span>
                                            </div>
                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${config.bg.replace('100', '500')}`}
                                                    style={{ width: `${percentage}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Recent Activity */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Recent Activity</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {logs.slice(0, UI_DEFAULTS.RECENT_ACTIVITY_LIMIT).map(log => (
                                    <div key={log.id} className="flex items-center gap-3 p-2 rounded bg-muted/50">
                                        <LogLevelBadge level={log.level} />
                                        <span className="flex-1 text-sm truncate">{log.message}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(log.createdAt).toLocaleTimeString()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Logs Tab */}
                <TabsContent value="logs" className="space-y-4">
                    {/* Search & Filter */}
                    <div className="flex gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search logs..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                className="pl-10"
                            />
                        </div>
                        <Select value={levelFilter} onValueChange={setLevelFilter}>
                            <SelectTrigger className="w-40">
                                <Filter className="w-4 h-4 mr-2" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Levels</SelectItem>
                                <SelectItem value="DEBUG">Debug</SelectItem>
                                <SelectItem value="INFO">Info</SelectItem>
                                <SelectItem value="WARN">Warning</SelectItem>
                                <SelectItem value="ERROR">Error</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button onClick={handleSearch}>Search</Button>
                    </div>

                    {/* Logs Table */}
                    <Card>
                        <ScrollArea className="h-[500px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-24">Level</TableHead>
                                        <TableHead className="w-32">Time</TableHead>
                                        <TableHead>Message</TableHead>
                                        <TableHead className="w-24">Step</TableHead>
                                        <TableHead className="w-24">Duration</TableHead>
                                        <TableHead className="w-24">Records</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredLogs.map(log => (
                                        <TableRow key={log.id}>
                                            <TableCell>
                                                <LogLevelBadge level={log.level} />
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {new Date(log.createdAt).toLocaleString()}
                                            </TableCell>
                                            <TableCell className="font-mono text-sm">
                                                {log.message}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {log.stepKey || '-'}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {log.durationMs ? `${log.durationMs}ms` : '-'}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {log.recordsProcessed !== undefined && (
                                                    <span>
                                                        {log.recordsProcessed}
                                                        {log.recordsFailed ? (
                                                            <span className="text-red-500 ml-1">({log.recordsFailed} failed)</span>
                                                        ) : null}
                                                    </span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </Card>
                </TabsContent>

                {/* Queue Tab */}
                <TabsContent value="queue" className="space-y-6">
                    {/* Queue Stats */}
                    <div className="grid grid-cols-4 gap-4">
                        <StatCard
                            title="Pending"
                            value={queueStats?.pending ?? 0}
                            icon={<Clock className="w-5 h-5" />}
                            color="yellow"
                        />
                        <StatCard
                            title="Running"
                            value={queueStats?.running ?? 0}
                            icon={<Zap className="w-5 h-5" />}
                            color="blue"
                        />
                        <StatCard
                            title="Completed Today"
                            value={queueStats?.completedToday ?? 0}
                            icon={<CheckCircle className="w-5 h-5" />}
                            color="green"
                        />
                        <StatCard
                            title="Failed"
                            value={queueStats?.failed ?? 0}
                            icon={<XCircle className="w-5 h-5" />}
                            color="red"
                        />
                    </div>

                    {/* Active Jobs by Pipeline */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Active Jobs by Pipeline</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {queueStats?.byPipeline.length ? (
                                <div className="space-y-2">
                                    {queueStats.byPipeline.map(p => (
                                        <div key={p.code} className="flex items-center justify-between p-2 bg-muted rounded">
                                            <span className="font-mono">{p.code}</span>
                                            <div className="flex gap-4">
                                                <Badge variant="outline">{p.pending} pending</Badge>
                                                <Badge variant="default">{p.running} running</Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-muted-foreground py-4">No active jobs</p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Recent Failures */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-red-500" />
                                Recent Failures
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {queueStats?.recentFailed.length ? (
                                <div className="space-y-2">
                                    {queueStats.recentFailed.map(f => (
                                        <div key={f.id} className="p-3 bg-red-50 border border-red-200 rounded">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-mono font-medium">{f.code}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    {f.finishedAt && new Date(f.finishedAt).toLocaleString()}
                                                </span>
                                            </div>
                                            <p className="text-sm text-red-700">{f.error}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-muted-foreground py-4">No recent failures</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

function StatCard({
    title,
    value,
    icon,
    color,
    trend,
}: {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    color: 'blue' | 'green' | 'yellow' | 'red';
    trend?: 'up' | 'down';
}) {
    const colors = {
        blue: 'bg-blue-100 text-blue-600',
        green: 'bg-green-100 text-green-600',
        yellow: 'bg-yellow-100 text-yellow-600',
        red: 'bg-red-100 text-red-600',
    };

    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex items-center justify-between">
                    <div className={`p-2 rounded-lg ${colors[color]}`}>
                        {icon}
                    </div>
                    {trend && (
                        trend === 'up' ? (
                            <TrendingUp className="w-4 h-4 text-red-500" />
                        ) : (
                            <TrendingDown className="w-4 h-4 text-green-500" />
                        )
                    )}
                </div>
                <div className="mt-3">
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-sm text-muted-foreground">{title}</p>
                </div>
            </CardContent>
        </Card>
    );
}

export default AnalyticsPanel;
