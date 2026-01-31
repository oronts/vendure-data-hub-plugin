import * as React from 'react';
import {
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@vendure/dashboard';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    Clock,
    RefreshCw,
    TrendingUp,
} from 'lucide-react';
import {
    useLogStats,
    usePipelines,
} from '../../../hooks';
import { ErrorState, LoadingState, StatCard } from '../../../components/shared';
import { QUERY_LIMITS, UI_DEFAULTS } from '../../../constants';
import { LevelBadge } from './LogLevelBadge';
import type { DataHubPipeline } from '../../../types';

/**
 * Pipeline statistics card showing log counts and performance metrics
 */
const PipelineStatCard = React.memo(function PipelineStatCard({ pipeline }: { pipeline: Pick<DataHubPipeline, 'id' | 'code' | 'name'> }) {
    const { data: stats } = useLogStats(pipeline.id);

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
});

/**
 * Overview tab displaying analytics dashboard with log statistics and pipeline health.
 * Shows total logs, errors, warnings, average duration, and per-pipeline metrics.
 */
export function LogsOverviewTab() {
    const statsQuery = useLogStats();
    const pipelinesQuery = usePipelines({ take: QUERY_LIMITS.ALL_ITEMS });

    const stats = statsQuery.data;
    const pipelines = pipelinesQuery.data?.items ?? [];

    const handleRefetch = React.useCallback(() => statsQuery.refetch(), [statsQuery]);

    if (statsQuery.isError) {
        return (
            <ErrorState
                title="Failed to load log statistics"
                message={statsQuery.error?.message || 'An unexpected error occurred'}
                onRetry={handleRefetch}
            />
        );
    }

    if (statsQuery.isLoading) {
        return <LoadingState type="card" rows={2} message="Loading analytics..." />;
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity className="w-5 h-5 text-primary" />
                            <CardTitle>Analytics Dashboard</CardTitle>
                        </div>
                        <Button variant="ghost" size="sm" onClick={handleRefetch} disabled={statsQuery.isLoading}>
                            <RefreshCw className={`w-4 h-4 mr-2 ${statsQuery.isLoading ? 'animate-spin' : ''}`} />
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
                            title="Total Logs"
                            value={stats?.total ?? 0}
                            icon={<TrendingUp className="w-4 h-4" />}
                            variant="info"
                        />
                        <StatCard
                            title="Errors Today"
                            value={stats?.errorsToday ?? 0}
                            icon={<AlertCircle className="w-4 h-4" />}
                            variant="error"
                        />
                        <StatCard
                            title="Warnings Today"
                            value={stats?.warningsToday ?? 0}
                            icon={<AlertTriangle className="w-4 h-4" />}
                            variant="warning"
                        />
                        <StatCard
                            title="Avg Duration"
                            value={`${stats?.avgDurationMs ?? 0}ms`}
                            icon={<Clock className="w-4 h-4" />}
                            variant="success"
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

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Pipeline Health</CardTitle>
                    <CardDescription>
                        Log statistics for each pipeline
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                        {pipelines.slice(0, UI_DEFAULTS.PIPELINE_STATS_DISPLAY_COUNT).map((p) => (
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
