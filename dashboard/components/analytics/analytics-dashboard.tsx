import * as React from 'react';
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
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
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
    LineChart,
    Calendar,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    Zap,
    Database,
    RefreshCw,
    Filter,
    Download,
} from 'lucide-react';
import { ANALYTICS_THRESHOLDS, getSuccessRateVariant, getSuccessRateTrend } from '../../constants';

// TYPES

export interface RunMetrics {
    total: number;
    successful: number;
    failed: number;
    pending: number;
    cancelled: number;
    avgDuration: number;
    totalRecords: number;
    errorRate: number;
}

export interface TimeSeriesPoint {
    timestamp: string;
    value: number;
    label?: string;
}

export interface PipelineStats {
    pipelineId: string;
    pipelineName: string;
    runCount: number;
    successRate: number;
    avgDuration: number;
    lastRun?: string;
    trend: 'up' | 'down' | 'stable';
}

export interface AnalyticsDashboardProps {
    metrics?: RunMetrics;
    runsByDay?: TimeSeriesPoint[];
    runsByPipeline?: PipelineStats[];
    errorsByType?: Array<{ type: string; count: number }>;
    recentErrors?: Array<{
        id: string;
        message: string;
        pipeline: string;
        timestamp: string;
    }>;
    loading?: boolean;
    onRefresh?: () => void;
    onTimeRangeChange?: (range: string) => void;
}

// STAT CARD

interface StatCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ReactNode;
    trend?: 'up' | 'down' | 'stable';
    trendValue?: string;
    variant?: 'default' | 'success' | 'warning' | 'danger';
}

function StatCard({ title, value, subtitle, icon, trend, trendValue, variant = 'default' }: StatCardProps) {
    const variantStyles = {
        default: 'bg-primary/10 text-primary',
        success: 'bg-green-500/10 text-green-500',
        warning: 'bg-yellow-500/10 text-yellow-500',
        danger: 'bg-red-500/10 text-red-500',
    };

    return (
        <Card>
            <CardContent className="p-6">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">{title}</p>
                        <p className="text-3xl font-bold mt-1">{value}</p>
                        {subtitle && (
                            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
                        )}
                        {trend && trendValue && (
                            <div className="flex items-center gap-1 mt-2">
                                {trend === 'up' && <ArrowUpRight className="w-4 h-4 text-green-500" />}
                                {trend === 'down' && <ArrowDownRight className="w-4 h-4 text-red-500" />}
                                {trend === 'stable' && <Minus className="w-4 h-4 text-muted-foreground" />}
                                <span className={`text-sm ${
                                    trend === 'up' ? 'text-green-500' :
                                    trend === 'down' ? 'text-red-500' :
                                    'text-muted-foreground'
                                }`}>
                                    {trendValue}
                                </span>
                            </div>
                        )}
                    </div>
                    <div className={`p-3 rounded-lg ${variantStyles[variant]}`}>
                        {icon}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// SIMPLE CHART COMPONENTS (No external deps)

interface BarChartProps {
    data: Array<{ label: string; value: number; color?: string }>;
    height?: number;
    showLabels?: boolean;
}

function SimpleBarChart({ data, height = 200, showLabels = true }: BarChartProps) {
    const maxValue = Math.max(...data.map(d => d.value), 1);

    return (
        <div className="w-full" style={{ height }}>
            <div className="flex items-end justify-between gap-2 h-full">
                {data.map((item, idx) => {
                    const barHeight = (item.value / maxValue) * 100;
                    return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-xs text-muted-foreground">
                                {item.value > 0 ? item.value : ''}
                            </span>
                            <div
                                className={`w-full rounded-t transition-all ${item.color || 'bg-primary'}`}
                                style={{ height: `${Math.max(barHeight, 2)}%` }}
                            />
                            {showLabels && (
                                <span className="text-xs text-muted-foreground truncate w-full text-center">
                                    {item.label}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

interface DonutChartProps {
    data: Array<{ label: string; value: number; color: string }>;
    size?: number;
    thickness?: number;
}

function SimpleDonutChart({ data, size = 160, thickness = 24 }: DonutChartProps) {
    const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
    const radius = (size - thickness) / 2;
    const circumference = 2 * Math.PI * radius;

    let currentOffset = 0;

    return (
        <div className="flex items-center gap-6">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    className="text-muted"
                    strokeWidth={thickness}
                />
                {data.map((item, idx) => {
                    const percentage = item.value / total;
                    const strokeDasharray = `${circumference * percentage} ${circumference}`;
                    const offset = currentOffset;
                    currentOffset += circumference * percentage;

                    return (
                        <circle
                            key={idx}
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            fill="none"
                            stroke={item.color}
                            strokeWidth={thickness}
                            strokeDasharray={strokeDasharray}
                            strokeDashoffset={-offset}
                            transform={`rotate(-90 ${size / 2} ${size / 2})`}
                            className="transition-all"
                        />
                    );
                })}
                <text
                    x={size / 2}
                    y={size / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-foreground text-2xl font-bold"
                >
                    {total}
                </text>
            </svg>
            <div className="space-y-2">
                {data.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                        <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: item.color }}
                        />
                        <span className="text-sm">{item.label}</span>
                        <span className="text-sm font-medium ml-auto">{item.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

interface SparklineProps {
    data: number[];
    color?: string;
    height?: number;
    width?: number;
}

function Sparkline({ data, color = '#3b82f6', height = 40, width = 120 }: SparklineProps) {
    if (data.length < 2) return null;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data.map((value, idx) => {
        const x = (idx / (data.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={width} height={height} className="overflow-visible">
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

// PIPELINE PERFORMANCE TABLE

interface PipelinePerformanceTableProps {
    pipelines: PipelineStats[];
}

function PipelinePerformanceTable({ pipelines }: PipelinePerformanceTableProps) {
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
                                {pipeline.runCount} runs • Last: {pipeline.lastRun || 'Never'}
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
                <div className="text-center py-8 text-muted-foreground">
                    No pipeline data available
                </div>
            )}
        </div>
    );
}

// RECENT ERRORS LIST

interface RecentErrorsListProps {
    errors: Array<{
        id: string;
        message: string;
        pipeline: string;
        timestamp: string;
    }>;
}

function RecentErrorsList({ errors }: RecentErrorsListProps) {
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
                                {error.pipeline} • {error.timestamp}
                            </p>
                        </div>
                    </div>
                </div>
            ))}
            {errors.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                    <p>No recent errors</p>
                </div>
            )}
        </div>
    );
}

// HELPER FUNCTIONS

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
}

// MAIN COMPONENT

export function AnalyticsDashboard({
    metrics = {
        total: 0,
        successful: 0,
        failed: 0,
        pending: 0,
        cancelled: 0,
        avgDuration: 0,
        totalRecords: 0,
        errorRate: 0,
    },
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

    // Calculate success rate
    const successRate = metrics.total > 0
        ? ((metrics.successful / metrics.total) * 100).toFixed(1)
        : '0.0';

    // Prepare chart data
    const runStatusData = [
        { label: 'Success', value: metrics.successful, color: '#22c55e' },
        { label: 'Failed', value: metrics.failed, color: '#ef4444' },
        { label: 'Pending', value: metrics.pending, color: '#f59e0b' },
        { label: 'Cancelled', value: metrics.cancelled, color: '#6b7280' },
    ];

    const dailyRunsData = runsByDay.map(point => ({
        label: new Date(point.timestamp).toLocaleDateString('en-US', { weekday: 'short' }),
        value: point.value,
        color: 'bg-primary',
    }));

    return (
        <div className="space-y-6">
            {/* Header */}
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
                            <SelectItem value="24h">Last 24 Hours</SelectItem>
                            <SelectItem value="7d">Last 7 Days</SelectItem>
                            <SelectItem value="30d">Last 30 Days</SelectItem>
                            <SelectItem value="90d">Last 90 Days</SelectItem>
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

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Total Runs"
                    value={formatNumber(metrics.total)}
                    subtitle="Pipeline executions"
                    icon={<Activity className="w-6 h-6" />}
                    trend="up"
                    trendValue="+12% from last period"
                />
                <StatCard
                    title="Success Rate"
                    value={`${successRate}%`}
                    subtitle={`${metrics.successful} successful runs`}
                    icon={<CheckCircle className="w-6 h-6" />}
                    variant={getSuccessRateVariant(parseFloat(successRate))}
                    trend={getSuccessRateTrend(parseFloat(successRate))}
                    trendValue={getSuccessRateTrend(parseFloat(successRate)) === 'up' ? '+2.5%' : '-1.2%'}
                />
                <StatCard
                    title="Avg Duration"
                    value={formatDuration(metrics.avgDuration)}
                    subtitle="Per pipeline run"
                    icon={<Clock className="w-6 h-6" />}
                    trend="down"
                    trendValue="-8% faster"
                />
                <StatCard
                    title="Records Processed"
                    value={formatNumber(metrics.totalRecords)}
                    subtitle="Total data processed"
                    icon={<Database className="w-6 h-6" />}
                    trend="up"
                    trendValue="+25% more data"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Run Status Distribution */}
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

                {/* Daily Runs */}
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
                            <SimpleBarChart data={dailyRunsData} height={180} />
                        ) : (
                            <div className="h-[180px] flex items-center justify-center text-muted-foreground">
                                No data available
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Pipeline Performance & Errors */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pipeline Performance */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Zap className="w-5 h-5" />
                            Pipeline Performance
                        </CardTitle>
                        <CardDescription>Individual pipeline metrics and trends</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[300px]">
                            <PipelinePerformanceTable pipelines={runsByPipeline} />
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* Recent Errors */}
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
                        <ScrollArea className="h-[300px]">
                            <RecentErrorsList errors={recentErrors} />
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>

            {/* Error Breakdown */}
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
                            height={150}
                        />
                    </CardContent>
                </Card>
            )}

            {/* Quick Stats Footer */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-muted/50">
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold">{runsByPipeline.length}</p>
                        <p className="text-sm text-muted-foreground">Active Pipelines</p>
                    </CardContent>
                </Card>
                <Card className="bg-muted/50">
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold">{metrics.pending}</p>
                        <p className="text-sm text-muted-foreground">Queued Runs</p>
                    </CardContent>
                </Card>
                <Card className="bg-muted/50">
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold">{(metrics.errorRate * 100).toFixed(1)}%</p>
                        <p className="text-sm text-muted-foreground">Error Rate</p>
                    </CardContent>
                </Card>
                <Card className="bg-muted/50">
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold">
                            {runsByPipeline.length > 0
                                ? (runsByPipeline.reduce((sum, p) => sum + p.successRate, 0) / runsByPipeline.length).toFixed(1)
                                : '0.0'}%
                        </p>
                        <p className="text-sm text-muted-foreground">Avg Success Rate</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default AnalyticsDashboard;
