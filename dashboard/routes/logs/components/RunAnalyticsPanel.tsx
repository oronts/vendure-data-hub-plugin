import { useLingui } from '@lingui/react';
import { useLocalFormat } from '@vendure/dashboard';
import { Activity, AlertCircle, Clock, TrendingUp } from 'lucide-react';
import { ErrorState, LoadingState, StatCard } from '../../../components/shared';
import { useAnalyticsOverview } from '../../../hooks/api/use-analytics';
import { LOGS_TRANSLATION_IDS } from '../../../constants/logs-labels';

export function RunAnalyticsPanel({ enabled }: { enabled: boolean }) {
    const { i18n } = useLingui();
    const { formatNumber } = useLocalFormat();
    const analyticsQuery = useAnalyticsOverview(enabled);

    if (!enabled) return null;

    if (analyticsQuery.isLoading) {
        return (
            <LoadingState
                type="card"
                rows={1}
                message={i18n._(LOGS_TRANSLATION_IDS.LOADING_ANALYTICS)}
            />
        );
    }

    if (analyticsQuery.isError) {
        return (
            <ErrorState
                title={i18n._(LOGS_TRANSLATION_IDS.FAILED_LOAD_ANALYTICS)}
                message={analyticsQuery.error.message}
                onRetry={() => void analyticsQuery.refetch()}
            />
        );
    }

    const analytics = analyticsQuery.data;

    return (
        <div className="space-y-3 mb-6">
            <h3 className="text-sm font-medium">
                {i18n._(LOGS_TRANSLATION_IDS.RUN_ANALYTICS)}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard
                    title={i18n._(LOGS_TRANSLATION_IDS.TOTAL_PIPELINES)}
                    value={formatNumber(analytics?.totalPipelines ?? 0)}
                    icon={<Activity className="w-4 h-4" />}
                    variant="info"
                />
                <StatCard
                    title={i18n._(LOGS_TRANSLATION_IDS.ENABLED_PIPELINES)}
                    value={formatNumber(analytics?.enabledPipelines ?? 0)}
                    icon={<Activity className="w-4 h-4" />}
                    variant="success"
                />
                <StatCard
                    title={i18n._(LOGS_TRANSLATION_IDS.RUNS_TODAY)}
                    value={formatNumber(analytics?.runsToday ?? 0)}
                    icon={<TrendingUp className="w-4 h-4" />}
                    variant="info"
                />
                <StatCard
                    title={i18n._(LOGS_TRANSLATION_IDS.RUNS_THIS_WEEK)}
                    value={formatNumber(analytics?.runsThisWeek ?? 0)}
                    icon={<TrendingUp className="w-4 h-4" />}
                    variant="info"
                />
                <StatCard
                    title={i18n._(LOGS_TRANSLATION_IDS.SUCCESS_TODAY)}
                    value={`${formatNumber(analytics?.successRateToday ?? 0)}%`}
                    icon={<TrendingUp className="w-4 h-4" />}
                    variant="success"
                />
                <StatCard
                    title={i18n._(LOGS_TRANSLATION_IDS.SUCCESS_THIS_WEEK)}
                    value={`${formatNumber(analytics?.successRateWeek ?? 0)}%`}
                    icon={<TrendingUp className="w-4 h-4" />}
                    variant="success"
                />
                <StatCard
                    title={i18n._(LOGS_TRANSLATION_IDS.RECORDS_PROCESSED_TODAY)}
                    value={formatNumber(analytics?.recordsProcessedToday ?? 0)}
                    icon={<TrendingUp className="w-4 h-4" />}
                    variant="success"
                />
                <StatCard
                    title={i18n._(LOGS_TRANSLATION_IDS.RECORDS_FAILED_TODAY)}
                    value={formatNumber(analytics?.recordsFailedToday ?? 0)}
                    icon={<AlertCircle className="w-4 h-4" />}
                    variant="error"
                />
                <StatCard
                    title={i18n._(LOGS_TRANSLATION_IDS.AVERAGE_RUN_DURATION_TODAY)}
                    value={`${formatNumber(Math.round(analytics?.avgDurationMsToday ?? 0))}ms`}
                    icon={<Clock className="w-4 h-4" />}
                    variant="info"
                />
            </div>
        </div>
    );
}
