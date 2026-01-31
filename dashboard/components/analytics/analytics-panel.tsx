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
    FileText,
    Filter,
    RefreshCw,
    Search,
    XCircle,
    Zap,
} from 'lucide-react';
import { useLogStats, useRecentLogs, useLogs, useQueueStats, logKeys, queueKeys } from '../../hooks';
import { useQueryClient } from '@tanstack/react-query';
import { UI_DEFAULTS, CHART_DIMENSIONS, LOG_LEVEL_CONFIG } from '../../constants';
import type { LogLevel } from '../../constants';
import { StatCard, EmptyState } from '../shared';
import { LogLevelBadge } from '../../routes/logs/components/LogLevelBadge';
import type { DataHubLogListOptions } from '../../types';

type AnalyticsTab = 'overview' | 'logs' | 'queue';

export function AnalyticsPanel() {
    const [activeTab, setActiveTab] = React.useState<AnalyticsTab>('overview');
    const [searchTerm, setSearchTerm] = React.useState('');
    const [levelFilter, setLevelFilter] = React.useState<string>('all');

    const queryClient = useQueryClient();

    const { data: stats, isLoading: statsLoading } = useLogStats();
    const { data: recentLogs, isLoading: logsLoading } = useRecentLogs(UI_DEFAULTS.RECENT_LOGS_LIMIT);
    const { data: queueStats, isLoading: queueLoading } = useQueueStats();

    const searchOptions = React.useMemo<DataHubLogListOptions | undefined>(() => {
        if (!searchTerm && levelFilter === 'all') return undefined;
        const filter: Record<string, unknown> = {};
        if (searchTerm) {
            filter.message = { contains: searchTerm };
        }
        if (levelFilter !== 'all') {
            filter.level = { eq: levelFilter };
        }
        return {
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            sort: { createdAt: 'DESC' },
            take: UI_DEFAULTS.PAGE_SIZE,
        };
    }, [searchTerm, levelFilter]);

    const { data: searchedLogs, isLoading: searchLoading, refetch: refetchSearch } = useLogs(searchOptions);
    const isLoading = statsLoading || logsLoading || queueLoading;
    const displayLogs = searchOptions ? (searchedLogs?.items ?? []) : (recentLogs ?? []);

    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: logKeys.all });
        queryClient.invalidateQueries({ queryKey: queueKeys.all });
    };

    const handleSearch = () => {
        if (searchOptions) {
            refetchSearch();
        }
    };

    return (
        <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AnalyticsTab)}>
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
                        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
                            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                </div>

                <TabsContent value="overview" className="space-y-6">
                    <div className="grid grid-cols-4 gap-4">
                        <StatCard
                            title="Total Logs"
                            value={stats?.total ?? 0}
                            icon={<FileText className="w-5 h-5" />}
                            variant="info"
                            isLoading={statsLoading}
                        />
                        <StatCard
                            title="Errors Today"
                            value={stats?.errorsToday ?? 0}
                            icon={<XCircle className="w-5 h-5" />}
                            variant="error"
                            trend={stats?.errorsToday && stats.errorsToday > 0 ? { direction: 'up', value: 0 } : undefined}
                            isLoading={statsLoading}
                        />
                        <StatCard
                            title="Warnings Today"
                            value={stats?.warningsToday ?? 0}
                            icon={<AlertTriangle className="w-5 h-5" />}
                            variant="warning"
                            isLoading={statsLoading}
                        />
                        <StatCard
                            title="Avg Duration"
                            value={`${stats?.avgDurationMs ?? 0}ms`}
                            icon={<Clock className="w-5 h-5" />}
                            variant="success"
                            isLoading={statsLoading}
                        />
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Log Level Distribution</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex gap-4">
                                {stats?.byLevel &&
                                    Object.entries(stats.byLevel)
                                        .filter(([level]) => level !== '__typename')
                                        .map(([level, count]) => {
                                        const config = LOG_LEVEL_CONFIG[level as LogLevel];
                                        const numCount = typeof count === 'number' ? count : 0;
                                        const percentage = stats.total > 0 ? (numCount / stats.total) * 100 : 0;
                                        return (
                                            <div key={level} className="flex-1">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className={`text-sm font-medium ${config.color}`}>{level}</span>
                                                    <span className="text-sm text-muted-foreground">{numCount}</span>
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

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Recent Activity</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {(recentLogs ?? []).slice(0, UI_DEFAULTS.RECENT_ACTIVITY_LIMIT).map((log) => (
                                    <div key={log.id} className="flex items-center gap-3 p-2 rounded bg-muted/50">
                                        <LogLevelBadge level={log.level as LogLevel} />
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

                <TabsContent value="logs" className="space-y-4">
                    <div className="flex gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search logs..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
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
                        <Button onClick={handleSearch} disabled={searchLoading}>
                            Search
                        </Button>
                    </div>

                    <Card>
                        <ScrollArea className={CHART_DIMENSIONS.SCROLL_AREA_LG}>
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
                                    {displayLogs.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell>
                                                <LogLevelBadge level={log.level as LogLevel} />
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {new Date(log.createdAt).toLocaleString()}
                                            </TableCell>
                                            <TableCell className="font-mono text-sm">{log.message}</TableCell>
                                            <TableCell className="text-xs">{log.stepKey || '-'}</TableCell>
                                            <TableCell className="text-xs">
                                                {log.durationMs ? `${log.durationMs}ms` : '-'}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {log.recordsProcessed !== undefined && log.recordsProcessed !== null && (
                                                    <span>
                                                        {log.recordsProcessed}
                                                        {log.recordsFailed ? (
                                                            <span className="text-red-500 ml-1">
                                                                ({log.recordsFailed} failed)
                                                            </span>
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

                <TabsContent value="queue" className="space-y-6">
                    <div className="grid grid-cols-4 gap-4">
                        <StatCard
                            title="Pending"
                            value={queueStats?.pending ?? 0}
                            icon={<Clock className="w-5 h-5" />}
                            variant="warning"
                            isLoading={queueLoading}
                        />
                        <StatCard
                            title="Running"
                            value={queueStats?.running ?? 0}
                            icon={<Zap className="w-5 h-5" />}
                            variant="info"
                            isLoading={queueLoading}
                        />
                        <StatCard
                            title="Completed Today"
                            value={queueStats?.completedToday ?? 0}
                            icon={<CheckCircle className="w-5 h-5" />}
                            variant="success"
                            isLoading={queueLoading}
                        />
                        <StatCard
                            title="Failed"
                            value={queueStats?.failed ?? 0}
                            icon={<XCircle className="w-5 h-5" />}
                            variant="error"
                            isLoading={queueLoading}
                        />
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Active Jobs by Pipeline</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {queueStats?.byPipeline?.length ? (
                                <div className="space-y-2">
                                    {queueStats.byPipeline.map((p) => (
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
                                <EmptyState
                                    icon={<Activity className="h-10 w-10" />}
                                    title="No active jobs"
                                    className="py-4"
                                />
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-red-500" />
                                Recent Failures
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {queueStats?.recentFailed?.length ? (
                                <div className="space-y-2">
                                    {queueStats.recentFailed.map((f) => (
                                        <div key={f.id} className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-mono font-medium">{f.code}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    {f.finishedAt && new Date(f.finishedAt).toLocaleString()}
                                                </span>
                                            </div>
                                            <p className="text-sm text-red-700 dark:text-red-400">{f.error}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <EmptyState
                                    icon={<CheckCircle className="h-10 w-10 text-green-500" />}
                                    title="No recent failures"
                                    className="py-4"
                                />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
