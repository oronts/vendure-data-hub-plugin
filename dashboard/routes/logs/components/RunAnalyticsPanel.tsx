import { Trans, useLingui } from '@lingui/react/macro';
import { useLocalFormat } from '@vendure/dashboard';
import { Activity, AlertCircle, Clock, TrendingUp } from 'lucide-react';
import { ErrorState, LoadingState, StatCard } from '../../../components/shared';
import { useAnalyticsOverview } from '../../../hooks/api/use-analytics';

export function RunAnalyticsPanel({ enabled }: { enabled: boolean }) {
    const { t } = useLingui();
    const { formatNumber } = useLocalFormat();
    const analyticsQuery = useAnalyticsOverview(enabled);

    if (!enabled) return null;

    if (analyticsQuery.isLoading) {
        return (
            <LoadingState
                type="card"
                rows={1}
                message={t`Loading analytics...`}
            />
        );
    }

    if (analyticsQuery.isError) {
        return (
            <ErrorState
                title={t`Failed to load log statistics`}
                message={analyticsQuery.error.message}
                onRetry={() => void analyticsQuery.refetch()}
            />
        );
    }

    const analytics = analyticsQuery.data;

    return (
        <div className="space-y-3 mb-6">
            <h3 className="text-sm font-medium">
                <Trans>Run analytics</Trans>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard
                    title={t`Total pipelines`}
                    value={formatNumber(analytics?.totalPipelines ?? 0)}
                    icon={<Activity className="w-4 h-4" />}
                    variant="info"
                />
                <StatCard
                    title={t`Enabled pipelines`}
                    value={formatNumber(analytics?.enabledPipelines ?? 0)}
                    icon={<Activity className="w-4 h-4" />}
                    variant="success"
                />
                <StatCard
                    title={t`Runs today`}
                    value={formatNumber(analytics?.runsToday ?? 0)}
                    icon={<TrendingUp className="w-4 h-4" />}
                    variant="info"
                />
                <StatCard
                    title={t`Runs this week`}
                    value={formatNumber(analytics?.runsThisWeek ?? 0)}
                    icon={<TrendingUp className="w-4 h-4" />}
                    variant="info"
                />
                <StatCard
                    title={t`Success today`}
                    value={`${formatNumber(analytics?.successRateToday ?? 0)}%`}
                    icon={<TrendingUp className="w-4 h-4" />}
                    variant="success"
                />
                <StatCard
                    title={t`Success this week`}
                    value={`${formatNumber(analytics?.successRateWeek ?? 0)}%`}
                    icon={<TrendingUp className="w-4 h-4" />}
                    variant="success"
                />
                <StatCard
                    title={t`Records processed today`}
                    value={formatNumber(analytics?.recordsProcessedToday ?? 0)}
                    icon={<TrendingUp className="w-4 h-4" />}
                    variant="success"
                />
                <StatCard
                    title={t`Records failed today`}
                    value={formatNumber(analytics?.recordsFailedToday ?? 0)}
                    icon={<AlertCircle className="w-4 h-4" />}
                    variant="error"
                />
                <StatCard
                    title={t`Average run duration today`}
                    value={`${formatNumber(Math.round(analytics?.avgDurationMsToday ?? 0))}ms`}
                    icon={<Clock className="w-4 h-4" />}
                    variant="info"
                />
            </div>
        </div>
    );
}
