import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@vendure/dashboard';
import {
    RefreshCw,
    Zap,
} from 'lucide-react';
import { useRecentLogs } from '../../../hooks';
import { ErrorState } from '../../../components/shared';
import { formatSmartDateTime } from '../../../utils';
import { LogLevelBadge } from './LogLevelBadge';
import { UI_LIMITS, SCROLL_HEIGHTS, POLLING_INTERVALS } from '../../../constants';

/**
 * Real-time log feed tab that auto-refreshes every 3 seconds.
 * Displays the latest 50 log entries across all pipelines.
 */
export function RealtimeLogTab() {
    const { i18n, t } = useLingui();
    const recentLogsQuery = useRecentLogs(UI_LIMITS.REALTIME_LOG_LIMIT);
    const { refetch: refetchRecentLogs } = recentLogsQuery;
    const logs = recentLogsQuery.data ?? [];
    const seconds = POLLING_INTERVALS.LIVE_LOGS / 1000;

    const handleRefetch = React.useCallback(() => refetchRecentLogs(), [refetchRecentLogs]);

    if (recentLogsQuery.isError) {
        return (
            <ErrorState
                title={t`Failed to load real-time logs`}
                message={recentLogsQuery.error?.message || t`An unexpected error occurred`}
                onRetry={handleRefetch}
            />
        );
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-primary" />
                        <CardTitle><Trans>Real-time Log Feed</Trans></CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                        <div
                            className={`w-2 h-2 rounded-full ${recentLogsQuery.isLoading ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}
                            aria-label={recentLogsQuery.isLoading
                                ? t`Loading logs`
                                : t`Connected and receiving logs`}
                            role="status"
                        />
                        <span className="text-sm text-muted-foreground">
                            {recentLogsQuery.isLoading
                                ? t`Loading...`
                                : t`Auto-refreshing every ${seconds}s`}
                        </span>
                        <Button variant="ghost" size="sm" onClick={handleRefetch} disabled={recentLogsQuery.isLoading} data-testid="datahub-realtime-log-refresh-button" aria-label={t`Refresh real-time logs`}>
                            <RefreshCw className={`w-4 h-4 ${recentLogsQuery.isLoading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>
                <CardDescription>
                    <Trans>Latest log entries across all pipelines</Trans>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className={`space-y-2 ${SCROLL_HEIGHTS.REALTIME_LOGS} overflow-y-auto`} role="list" aria-label={t`Real-time log entries`}>
                    {logs.map((log) => {
                        const count = log.recordsProcessed;
                        const failedCount = log.recordsFailed ?? 0;
                        const failedLabel = (() => {
                            const count = failedCount;
                            return t`${count} failed`;
                        })();

                        return (
                            <div
                                key={log.id}
                                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/30"
                                role="listitem"
                            >
                                <LogLevelBadge level={log.level} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {log.pipeline?.code ?? 'system'}
                                        </span>
                                        {log.stepKey && (
                                            <>
                                                <span className="text-muted-foreground">-&gt;</span>
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    {log.stepKey}
                                                </span>
                                            </>
                                        )}
                                        <span className="text-muted-foreground text-xs ml-auto">
                                            {formatSmartDateTime(log.createdAt, i18n.locale)}
                                        </span>
                                    </div>
                                    <div className="text-sm">{log.message}</div>
                                    {(count != null || log.durationMs != null) && (
                                        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                            {log.durationMs != null && (
                                                <span>{log.durationMs}ms</span>
                                            )}
                                            {count != null && (
                                                <span>
                                                    {count === 1
                                                        ? t`${count} record`
                                                        : t`${count} records`}
                                                    {failedCount > 0 && (
                                                        <span className="text-red-600 dark:text-red-400 ml-1">
                                                            ({failedLabel})
                                                        </span>
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {logs.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                            <Trans>No recent logs. Pipeline activity will appear here.</Trans>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
