import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@vendure/dashboard';
import { toast } from 'sonner';
import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    Download,
    Filter,
    Hash,
    RefreshCw,
    Search,
    X,
} from 'lucide-react';
import {
    useLogs,
    useOptionValues,
} from '../../../hooks';
import { ErrorState, LoadingState, PipelineSelector } from '../../../components/shared';
import { UI_DEFAULTS, FILTER_VALUES } from '../../../constants';
import { downloadBrowserBlob } from '../../../utils/browser-download';
import { LogTableRow } from './LogTableRow';
import { LogDetailDrawer } from './LogDetailDrawer';
import { SortOrder, type DataHubLogListOptions } from '../../../types';
import type { LogListItem } from './LogTableRow';

/**
 * Log explorer tab with filters, table, and export functionality.
 * Allows filtering by pipeline, level, date range, and message search.
 */
export function LogExplorerTab({ initialRunId }: { initialRunId?: string }) {
    const { i18n, t } = useLingui();
    const [runId, setRunId] = React.useState<string>(initialRunId ?? '');
    const [pipelineId, setPipelineId] = React.useState<string>('');
    const [level, setLevel] = React.useState<string>('');
    const [search, setSearch] = React.useState<string>('');
    const [startDate, setStartDate] = React.useState<string>('');
    const [endDate, setEndDate] = React.useState<string>('');
    const [page, setPage] = React.useState(1);
    const [selectedLog, setSelectedLog] = React.useState<LogListItem | null>(null);
    const { options: logLevelOptions } = useOptionValues('logLevels');
    const pageSize = UI_DEFAULTS.LOG_EXPLORER_PAGE_SIZE;

    React.useEffect(() => {
        setRunId(initialRunId ?? '');
        setPage(1);
    }, [initialRunId]);

    const filter = React.useMemo((): DataHubLogListOptions['filter'] => {
        const f: DataHubLogListOptions['filter'] = {};
        if (runId) {
            f.runId = { eq: runId };
        }
        if (pipelineId) {
            f.pipelineId = { eq: pipelineId };
        }
        if (level) {
            f.level = { eq: level };
        }
        if (search) {
            f.message = { contains: search };
        }
        if (startDate) {
            f.createdAt = { ...(f.createdAt || {}), after: new Date(startDate).toISOString() };
        }
        if (endDate) {
            f.createdAt = { ...(f.createdAt || {}), before: new Date(endDate).toISOString() };
        }
        return Object.keys(f).length > 0 ? f : undefined;
    }, [runId, pipelineId, level, search, startDate, endDate]);

    const logsQuery = useLogs({
        filter,
        sort: { createdAt: SortOrder.DESC },
        skip: (page - 1) * pageSize,
        take: pageSize,
    });

    const logs = React.useMemo(() => logsQuery.data?.items ?? [], [logsQuery.data?.items]);
    const totalItems = logsQuery.data?.totalItems ?? 0;
    const totalPages = Math.ceil(totalItems / pageSize);
    const total = totalPages || 1;

    const handleRefetch = () => logsQuery.refetch();

    const handleRunIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setRunId(e.target.value);
        setPage(1);
    };

    const handleClearRunId = () => {
        setRunId('');
        setPage(1);
    };

    const handlePipelineChange = (v: string) => {
        setPipelineId(v === FILTER_VALUES.ALL ? '' : v);
        setPage(1);
    };

    const handleLevelChange = (v: string) => {
        setLevel(v === FILTER_VALUES.ALL ? '' : v);
        setPage(1);
    };

    const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setStartDate(e.target.value);
        setPage(1);
    };

    const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEndDate(e.target.value);
        setPage(1);
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearch(e.target.value);
        setPage(1);
    };

    const handlePrevPage = () => setPage(p => Math.max(1, p - 1));

    const handleNextPage = () => setPage(p => Math.min(totalPages, p + 1));

    const handleSelectLog = React.useCallback((log: LogListItem) => {
        setSelectedLog(log);
    }, []);

    const handleCloseDrawer = React.useCallback(() => {
        setSelectedLog(null);
    }, []);

    const handleExport = React.useCallback(() => {
        try {
            const data = logs.map((log) => ({
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
            downloadBrowserBlob(
                blob,
                `datahub-logs-${new Date().toISOString().split('T')[0]}.json`,
            );
            toast.success(t`Logs exported successfully`);
        } catch {
            toast.error(t`Failed to export logs`);
        }
    }, [logs, t]);

    if (logsQuery.isError) {
        return (
            <ErrorState
                title={t`Failed to load logs`}
                message={logsQuery.error?.message || t`An unexpected error occurred`}
                onRetry={handleRefetch}
            />
        );
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Filter className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                            <Trans>Filters</Trans>
                        </span>
                    </div>
                    {runId && (
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-muted-foreground">
                                <Trans>Filtered by Run ID:</Trans>
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-mono">
                                {runId}
                                <button type="button" onClick={handleClearRunId} className="ml-1 hover:text-destructive" aria-label={t`Clear run ID filter`}>
                                    <X className="h-3 w-3" />
                                </button>
                            </span>
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3" data-testid="datahub-logs-filters">
                        <div className="relative">
                            <Hash className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={runId}
                                onChange={handleRunIdChange}
                                placeholder={t`Run ID...`}
                                className="pl-9"
                                data-testid="datahub-logs-filter-run-id"
                                aria-label={t`Filter by run ID`}
                            />
                        </div>
                        <PipelineSelector
                            value={pipelineId || FILTER_VALUES.ALL}
                            onValueChange={handlePipelineChange}
                            allOption={{ value: FILTER_VALUES.ALL, label: t`All Pipelines` }}
                            placeholder={t`All Pipelines`}
                            data-testid="datahub-logs-filter-pipeline"
                        />

                        <Select value={level || FILTER_VALUES.ALL} onValueChange={handleLevelChange}>
                            <SelectTrigger data-testid="datahub-logs-filter-level">
                                <SelectValue placeholder={t`All Levels`} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={FILTER_VALUES.ALL}>
                                    <Trans>All Levels</Trans>
                                </SelectItem>
                                {logLevelOptions.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="relative">
                            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="date"
                                value={startDate}
                                onChange={handleStartDateChange}
                                className="pl-9"
                                placeholder={t`Start date`}
                                data-testid="datahub-logs-filter-start-date"
                                aria-label={t`Filter by start date`}
                            />
                        </div>

                        <div className="relative">
                            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="date"
                                value={endDate}
                                onChange={handleEndDateChange}
                                className="pl-9"
                                placeholder={t`End date`}
                                data-testid="datahub-logs-filter-end-date"
                                aria-label={t`Filter by end date`}
                            />
                        </div>

                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={handleSearchChange}
                                placeholder={t`Search logs...`}
                                className="pl-9"
                                data-testid="datahub-logs-search"
                                aria-label={t`Search log messages`}
                            />
                        </div>

                        <div className="flex gap-2">
                            <Button variant="outline" size="icon" onClick={handleRefetch} disabled={logsQuery.isLoading} data-testid="datahub-logs-refresh-button" aria-label={t`Refresh logs`}>
                                <RefreshCw className={`w-4 h-4 ${logsQuery.isLoading ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button variant="outline" onClick={handleExport} disabled={logs.length === 0} data-testid="datahub-logs-export-button">
                                <Download className="w-4 h-4 mr-2" />
                                <Trans>Export</Trans>
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                            <Trans>Log Entries</Trans> ({totalItems.toLocaleString(i18n.locale)})
                        </CardTitle>
                        <div className="flex items-center gap-2" data-testid="datahub-logs-pagination">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handlePrevPage}
                                disabled={page === 1}
                                data-testid="datahub-logs-prev-page"
                                aria-label={t`Previous page`}
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="text-sm text-muted-foreground">
                                {t`Page ${page} of ${total}`}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleNextPage}
                                disabled={page >= totalPages}
                                data-testid="datahub-logs-next-page"
                                aria-label={t`Next page`}
                            >
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-lg overflow-x-auto">
                        <table className="w-full text-sm" data-testid="datahub-logs-table">
                            <caption className="sr-only">
                                <Trans>Log Entries</Trans>
                            </caption>
                            <thead>
                                <tr className="bg-muted">
                                    <th scope="col" className="text-left px-3 py-2 w-36"><Trans>Time</Trans></th>
                                    <th scope="col" className="text-left px-3 py-2 w-20"><Trans>Level</Trans></th>
                                    <th scope="col" className="text-left px-3 py-2 w-32"><Trans>Pipeline</Trans></th>
                                    <th scope="col" className="text-left px-3 py-2 w-24"><Trans>Step</Trans></th>
                                    <th scope="col" className="text-left px-3 py-2"><Trans>Message</Trans></th>
                                    <th scope="col" className="text-right px-3 py-2 w-20"><Trans>Duration</Trans></th>
                                    <th scope="col" className="text-right px-3 py-2 w-24"><Trans>Records</Trans></th>
                                </tr>
                            </thead>
                            <tbody>
                                {logsQuery.isLoading && logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-4">
                                            <LoadingState type="table" rows={10} message={t`Loading log entries...`} />
                                        </td>
                                    </tr>
                                ) : logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                                            <Trans>No log entries found</Trans>
                                        </td>
                                    </tr>
                                ) : (
                                    logs.map((log) => (
                                        <LogTableRow
                                            key={log.id}
                                            log={log}
                                            onSelect={handleSelectLog}
                                        />
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <LogDetailDrawer log={selectedLog} onClose={handleCloseDrawer} />
        </div>
    );
}
