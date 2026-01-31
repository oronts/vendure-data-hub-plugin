import * as React from 'react';
import { memo } from 'react';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Badge,
    ScrollArea,
} from '@vendure/dashboard';
import {
    Activity,
    TrendingUp,
    TrendingDown,
    Clock,
    CheckCircle,
    XCircle,
    AlertTriangle,
    BarChart3,
    PieChart,
    Calendar,
    Minus,
    Zap,
    Database,
    RefreshCw,
    Filter,
    Download,
} from 'lucide-react';
import {
    ANALYTICS_THRESHOLDS,
    TIME_RANGE_OPTIONS,
    CHART_COLORS,
    CHART_DIMENSIONS,
    getSuccessRateVariant,
    getSuccessRateTrend,
    getErrorRateVariant,
} from '../../constants';
import { formatDuration, formatCompactNumber } from '../../utils';
import { StatCard, EmptyState, SimpleBarChart, SimpleDonutChart } from '../shared';
import type {
    RunMetrics,
    TimeSeriesPoint,
    PipelineStats,
    AnalyticsDashboardProps,
} from '../../types';

interface PipelinePerformanceTableProps {
    pipelines: PipelineStats[];
}

const PipelinePerformanceTable = memo(function PipelinePerformanceTable({ pipelines }: PipelinePerformanceTableProps) {
    return (
        <div className="space-y-2">
            {pipelines.map(pipeline => (
                <div
                    key={pipeline.pipelineId}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                            pipeline.successRate >= ANALYTICS_THRESHOLDS.SUCCESS_RATE_GOOD ? 'bg-green-500' :
                            pipeline.successRate >= ANALYTICS_THRESHOLDS.SUCCESS_RATE_WARNING ? 'bg-yellow-500' :
                            'bg-red-500'
                        }`} />
                        <div>
                            <p className="font-medium">{pipeline.pipelineName}</p>
                            <p className="text-xs text-muted-foreground">
                                {pipeline.runCount} runs | Last: {pipeline.lastRun || 'Never'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="text-right">
                            <p className="text-sm font-medium">{pipeline.successRate.toFixed(1)}%</p>
                            <p className="text-xs text-muted-foreground">Success Rate</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-medium">{formatDuration(pipeline.avgDuration)}</p>
                            <p className="text-xs text-muted-foreground">Avg Duration</p>
                        </div>
                        <div>
                            {pipeline.trend === 'up' && (
                                <TrendingUp className="w-5 h-5 text-green-500" />
                            )}
                            {pipeline.trend === 'down' && (
                                <TrendingDown className="w-5 h-5 text-red-500" />
                            )}
                            {pipeline.trend === 'stable' && (
                                <Minus className="w-5 h-5 text-muted-foreground" />
                            )}
                        </div>
                    </div>
                </div>
            ))}
            {pipelines.length === 0 && (
                <EmptyState
                    icon={<BarChart3 className="h-12 w-12" />}
                    title="No pipeline data"
                    description="Pipeline performance metrics will appear here once you have run data"
                />
            )}
        </div>
    );
});

interface RecentErrorsListProps {
    errors: Array<{
        id: string;
        message: string;
        pipeline: string;
        timestamp: string;
    }>;
}

const RecentErrorsList = memo(function RecentErrorsList({ errors }: RecentErrorsListProps) {
    return (
        <div className="space-y-2">
            {errors.map(error => (
                <div
                    key={error.id}
                    className="p-3 border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/50 rounded-lg"
                >
                    <div className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-red-700 dark:text-red-400 truncate">
                                {error.message}
                            </p>
                            <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-1">
                                {error.pipeline} | {error.timestamp}
                            </p>
                        </div>
                    </div>
                </div>
            ))}
            {errors.length === 0 && (
                <EmptyState
                    icon={<CheckCircle className="h-12 w-12 text-green-500" />}
                    title="No recent errors"
                    description="All pipelines are running smoothly"
                />
            )}
        </div>
    );
});

const DEFAULT_METRICS: RunMetrics = {
    total: 0,
    successful: 0,
    failed: 0,
    pending: 0,
    cancelled: 0,
    avgDuration: 0,
    totalRecords: 0,
    errorRate: 0,
};

export function AnalyticsDashboard({
    metrics = DEFAULT_METRICS,
    runsByDay = [],
    runsByPipeline = [],
    errorsByType = [],
    recentErrors = [],
    loading = false,
    onRefresh,
    onTimeRangeChange,
}: AnalyticsDashboardProps) {
    const [timeRange, setTimeRange] = React.useState('7d');

    const handleTimeRangeChange = (range: string) => {
        setTimeRange(range);
        onTimeRangeChange?.(range);
    };

    const successRate = metrics.total > 0
        ? ((metrics.successful / metrics.total) * 100).toFixed(1)
        : '0.0';

    const runStatusData = [
        { label: 'Success', value: metrics.successful, color: CHART_COLORS.success },
        { label: 'Failed', value: metrics.failed, color: CHART_COLORS.error },
        { label: 'Pending', value: metrics.pending, color: CHART_COLORS.warning },
        { label: 'Cancelled', value: metrics.cancelled, color: CHART_COLORS.neutral },
    ];

    const dailyRunsData = runsByDay.map(point => ({
        label: new Date(point.timestamp).toLocaleDateString('en-US', { weekday: 'short' }),
        value: point.value,
        color: 'bg-primary',
    }));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
                    <p className="text-muted-foreground">Pipeline performance and execution metrics</p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={timeRange} onValueChange={handleTimeRangeChange}>
                        <SelectTrigger className="w-36">
                            <Calendar className="w-4 h-4 mr-2" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {TIME_RANGE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {onRefresh && (
                        <Button variant="outline" onClick={onRefresh} disabled={loading}>
                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    )}
                    <Button variant="outline">
                        <Download className="w-4 h-4 mr-2" />
                        Export
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Total Runs"
                    value={formatCompactNumber(metrics.total)}
                    subtitle="Pipeline executions"
                    icon={<Activity className="w-6 h-6" />}
                    trend={{ direction: 'up', value: 12, label: '+12% from last period' }}
                />
                <StatCard
                    title="Success Rate"
                    value={`${successRate}%`}
                    subtitle={`${metrics.successful} successful runs`}
                    icon={<CheckCircle className="w-6 h-6" />}
                    variant={getSuccessRateVariant(parseFloat(successRate))}
                    trend={{
                        direction: getSuccessRateTrend(parseFloat(successRate)),
                        value: getSuccessRateTrend(parseFloat(successRate)) === 'up' ? 2.5 : 1.2,
                        label: getSuccessRateTrend(parseFloat(successRate)) === 'up' ? '+2.5%' : '-1.2%',
                    }}
                />
                <StatCard
                    title="Avg Duration"
                    value={formatDuration(metrics.avgDuration)}
                    subtitle="Per pipeline run"
                    icon={<Clock className="w-6 h-6" />}
                    trend={{ direction: 'down', value: 8, label: '-8% faster' }}
                />
                <StatCard
                    title="Records Processed"
                    value={formatCompactNumber(metrics.totalRecords)}
                    subtitle="Total data processed"
                    icon={<Database className="w-6 h-6" />}
                    trend={{ direction: 'up', value: 25, label: '+25% more data' }}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <PieChart className="w-5 h-5" />
                            Run Status Distribution
                        </CardTitle>
                        <CardDescription>Breakdown of pipeline run outcomes</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <SimpleDonutChart data={runStatusData} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="w-5 h-5" />
                            Daily Pipeline Runs
                        </CardTitle>
                        <CardDescription>Runs per day over the selected period</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {dailyRunsData.length > 0 ? (
                            <SimpleBarChart data={dailyRunsData} height={CHART_DIMENSIONS.BAR_HEIGHT_MD} />
                        ) : (
                            <EmptyState
                                icon={<BarChart3 className="h-10 w-10" />}
                                title="No data available"
                                className="h-[180px] py-4"
                            />
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Zap className="w-5 h-5" />
                            Pipeline Performance
                        </CardTitle>
                        <CardDescription>Individual pipeline metrics and trends</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className={CHART_DIMENSIONS.SCROLL_AREA_SM}>
                            <PipelinePerformanceTable pipelines={runsByPipeline} />
                        </ScrollArea>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-red-500" />
                                    Recent Errors
                                </CardTitle>
                                <CardDescription>Latest pipeline failures and issues</CardDescription>
                            </div>
                            {metrics.failed > 0 && (
                                <Badge variant="destructive">{metrics.failed} failed</Badge>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className={CHART_DIMENSIONS.SCROLL_AREA_SM}>
                            <RecentErrorsList errors={recentErrors} />
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>

            {errorsByType.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Filter className="w-5 h-5" />
                            Errors by Type
                        </CardTitle>
                        <CardDescription>Categorization of pipeline errors</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <SimpleBarChart
                            data={errorsByType.map(e => ({
                                label: e.type,
                                value: e.count,
                                color: 'bg-red-500',
                            }))}
                            height={CHART_DIMENSIONS.BAR_HEIGHT_SM}
                        />
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    title="Active Pipelines"
                    value={runsByPipeline.length}
                    icon={<Zap className="w-5 h-5" />}
                />
                <StatCard
                    title="Queued Runs"
                    value={metrics.pending}
                    icon={<Clock className="w-5 h-5" />}
                    variant={metrics.pending > 0 ? 'warning' : 'default'}
                />
                <StatCard
                    title="Error Rate"
                    value={`${(metrics.errorRate * 100).toFixed(1)}%`}
                    icon={<AlertTriangle className="w-5 h-5" />}
                    variant={getErrorRateVariant(metrics.errorRate)}
                />
                <StatCard
                    title="Avg Success Rate"
                    value={`${runsByPipeline.length > 0
                        ? (runsByPipeline.reduce((sum, p) => sum + p.successRate, 0) / runsByPipeline.length).toFixed(1)
                        : '0.0'}%`}
                    icon={<TrendingUp className="w-5 h-5" />}
                    variant={getSuccessRateVariant(
                        runsByPipeline.length > 0
                            ? runsByPipeline.reduce((sum, p) => sum + p.successRate, 0) / runsByPipeline.length
                            : 0
                    )}
                />
            </div>
        </div>
    );
}
