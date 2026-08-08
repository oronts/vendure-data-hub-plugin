import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    api,
    useLocalFormat,
    usePermissions,
} from '@vendure/dashboard';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    Clock,
    RefreshCw,
    TrendingUp,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { analyticsKeys } from '../../../hooks/api/use-analytics';
import { useOptionValues } from '../../../hooks/api/use-config-options';
import { logKeys, useLogStats } from '../../../hooks/api/use-logs';
import { pipelinesListDocument } from '../../../hooks/api/use-pipelines';
import { ErrorState, LoadingState, StatCard, LoadMoreButton } from '../../../components/shared';
import { LevelBadge } from './LogLevelBadge';
import { SortOrder, type DataHubPipeline } from '../../../types';
import { DATAHUB_PERMISSIONS } from '../../../constants';
import { RunAnalyticsPanel } from './RunAnalyticsPanel';

/**
 * Pipeline statistics card showing log counts and performance metrics
 */
const PipelineStatCard = React.memo(function PipelineStatCard({ pipeline }: { pipeline: Pick<DataHubPipeline, 'id' | 'code' | 'name'> }) {
    const { t } = useLingui();
    const { data: stats, isLoading } = useLogStats(pipeline.id);
    const logCount = stats?.total ?? 0;
    const errorCount = stats?.errorsToday ?? 0;
    const duration = stats?.avgDurationMs;
    const logCountLabel = (() => {
        const count = logCount;
        return count === 1 ? t`${count} log` : t`${count} logs`;
    })();
    const errorCountLabel = (() => {
        const count = errorCount;
        return count === 1 ? t`${count} error today` : t`${count} errors today`;
    })();

    return (
        <div className="border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
                <div className="font-medium">{pipeline.name}</div>
                <code className="text-xs text-muted-foreground">{pipeline.code}</code>
            </div>
            <div className="flex gap-3 text-sm">
                <span className="text-muted-foreground">
                    {isLoading
                        ? '\u2014'
                        : logCountLabel}
                </span>
                {!isLoading && (stats?.errorsToday ?? 0) > 0 && (
                    <span className="text-red-600 dark:text-red-400">
                        {errorCountLabel}
                    </span>
                )}
                {!isLoading && (duration ?? 0) > 0 && (
                    <span className="text-muted-foreground">
                        {t`avg ${duration}ms`}
                    </span>
                )}
            </div>
        </div>
    );
});

const PIPELINE_HEALTH_PAGE_SIZE = 6;

/**
 * Overview tab displaying analytics dashboard with log statistics and pipeline health.
 * Shows total logs, errors, warnings, average duration, and per-pipeline metrics.
 */
export function LogsOverviewTab() {
    const { t } = useLingui();
    const { formatNumber } = useLocalFormat();
    const queryClient = useQueryClient();
    const { hasPermissions } = usePermissions();
    const canReadPipelines = hasPermissions([DATAHUB_PERMISSIONS.READ_PIPELINE]);
    const canViewAnalytics = hasPermissions([DATAHUB_PERMISSIONS.VIEW_ANALYTICS]);
    const [pipelineLimit, setPipelineLimit] = React.useState(PIPELINE_HEALTH_PAGE_SIZE);
    const { options: logLevels } = useOptionValues('logLevels');
    const statsQuery = useLogStats();
    const pipelinesQuery = useQuery({
        queryKey: ['logs', 'pipeline-health', pipelineLimit],
        queryFn: () => api.query(pipelinesListDocument, {
            options: {
                take: pipelineLimit,
                sort: { name: SortOrder.ASC },
            },
        }).then(response => response.dataHubPipelines),
        enabled: canReadPipelines,
    });
    const { refetch: refetchPipelines } = pipelinesQuery;
    const stats = statsQuery.data;
    const pipelines = pipelinesQuery.data?.items ?? [];
    const totalPipelines = pipelinesQuery.data?.totalItems ?? 0;
    const remainingPipelines = Math.max(0, totalPipelines - pipelines.length);
    const pipelineStatsDescription = (() => {
        const count = totalPipelines;
        return t`Log statistics for each pipeline (${count} total)`;
    })();

    const handleRefetch = React.useCallback(() => {
        void queryClient.refetchQueries({ queryKey: logKeys.stats() });
        if (canViewAnalytics) {
            void queryClient.refetchQueries({ queryKey: analyticsKeys.overview() });
        }
        if (canReadPipelines) {
            void refetchPipelines();
        }
    }, [canReadPipelines, canViewAnalytics, queryClient, refetchPipelines]);

    if (statsQuery.isError || (canReadPipelines && pipelinesQuery.isError)) {
        return (
            <ErrorState
                title={t`Failed to load log statistics`}
                message={statsQuery.error?.message
                    || (canReadPipelines ? pipelinesQuery.error?.message : undefined)
                    || t`An unexpected error occurred`}
                onRetry={handleRefetch}
            />
        );
    }

    if (statsQuery.isLoading || (canReadPipelines && pipelinesQuery.isLoading)) {
        return (
            <LoadingState
                type="card"
                rows={2}
                message={t`Loading analytics...`}
            />
        );
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity className="w-5 h-5 text-primary" />
                            <CardTitle>
                                <Trans>Analytics Dashboard</Trans>
                            </CardTitle>
                        </div>
                        <Button variant="ghost" size="sm" onClick={handleRefetch} disabled={statsQuery.isLoading}>
                            <RefreshCw className={`w-4 h-4 mr-2 ${statsQuery.isLoading ? 'animate-spin' : ''}`} />
                            <Trans>Refresh</Trans>
                        </Button>
                    </div>
                    <CardDescription>
                        <Trans>Pipeline execution metrics and log statistics</Trans>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <RunAnalyticsPanel enabled={canViewAnalytics} />
                    <h3 className="text-sm font-medium mb-3">
                        <Trans>Log diagnostics</Trans>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        <StatCard
                            title={t`Retained logs`}
                            value={formatNumber(stats?.total ?? 0)}
                            icon={<TrendingUp className="w-4 h-4" />}
                            variant="info"
                        />
                        <StatCard
                            title={t`Errors Today`}
                            value={formatNumber(stats?.errorsToday ?? 0)}
                            icon={<AlertCircle className="w-4 h-4" />}
                            variant="error"
                        />
                        <StatCard
                            title={t`Warnings Today`}
                            value={formatNumber(stats?.warningsToday ?? 0)}
                            icon={<AlertTriangle className="w-4 h-4" />}
                            variant="warning"
                        />
                        <StatCard
                            title={t`Average log duration`}
                            value={`${formatNumber(stats?.avgDurationMs ?? 0)}ms`}
                            icon={<Clock className="w-4 h-4" />}
                            variant="success"
                        />
                        <div className="border rounded-lg p-3 bg-muted/30">
                            <div className="text-xs text-muted-foreground mb-2">
                                <Trans>By Level</Trans>
                            </div>
                            <div className="flex gap-2">
                                {logLevels.map(level => (
                                    <LevelBadge
                                        key={level.value}
                                        level={level.value}
                                        count={(stats?.byLevel as Record<string, number> | undefined)?.[level.value] ?? 0}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base">
                                <Trans>Pipeline Health</Trans>
                            </CardTitle>
                            <CardDescription>
                                {canReadPipelines
                                    ? pipelineStatsDescription
                                    : t`Pipeline statistics require permission`}
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {!canReadPipelines ? (
                        <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                            <Trans>You do not have permission to view pipeline details.</Trans>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {pipelines.map((p) => (
                                    <PipelineStatCard key={p.id} pipeline={p} />
                                ))}
                            </div>
                            {remainingPipelines > 0 && (
                                <LoadMoreButton
                                    remaining={remainingPipelines}
                                    loading={pipelinesQuery.isFetching}
                                    onClick={() => setPipelineLimit(current => Math.min(
                                        current + PIPELINE_HEALTH_PAGE_SIZE,
                                        totalPipelines,
                                    ))}
                                />
                            )}
                            {pipelines.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Trans>No pipelines found</Trans>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
