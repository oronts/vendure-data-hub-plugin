import * as React from 'react';
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
    usePipelines,
} from '../../../hooks';
import { ErrorState, LoadingState } from '../../../components/shared';
import { QUERY_LIMITS, UI_DEFAULTS, FILTER_VALUES, TOAST_LOG } from '../../../constants';
import { LogTableRow } from './LogTableRow';
import { LogDetailDrawer } from './LogDetailDrawer';
import type { DataHubLogListOptions, DataHubLog } from '../../../types';

/**
 * Log explorer tab with filters, table, and export functionality.
 * Allows filtering by pipeline, level, date range, and message search.
 */
export function LogExplorerTab({ initialRunId }: { initialRunId?: string }) {
    const [runId, setRunId] = React.useState<string>(initialRunId ?? '');
    const [pipelineId, setPipelineId] = React.useState<string>('');
    const [level, setLevel] = React.useState<string>('');
    const [search, setSearch] = React.useState<string>('');
    const [startDate, setStartDate] = React.useState<string>('');
    const [endDate, setEndDate] = React.useState<string>('');
    const [page, setPage] = React.useState(1);
    const [selectedLog, setSelectedLog] = React.useState<DataHubLog | null>(null);
    const pageSize = UI_DEFAULTS.LOG_EXPLORER_PAGE_SIZE;

    const pipelinesQuery = usePipelines({ take: QUERY_LIMITS.ALL_ITEMS });

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
        sort: { createdAt: 'DESC' },
        skip: (page - 1) * pageSize,
        take: pageSize,
    });

    const logs = logsQuery.data?.items ?? [];
    const totalItems = logsQuery.data?.totalItems ?? 0;
    const totalPages = Math.ceil(totalItems / pageSize);
    const pipelines = pipelinesQuery.data?.items ?? [];

    const handleRefetch = React.useCallback(() => logsQuery.refetch(), [logsQuery.refetch]);

    const handleRunIdChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setRunId(e.target.value);
        setPage(1);
    }, []);

    const handleClearRunId = React.useCallback(() => {
        setRunId('');
        setPage(1);
    }, []);

    const handlePipelineChange = React.useCallback((v: string) => {
        setPipelineId(v === FILTER_VALUES.ALL ? '' : v);
        setPage(1);
    }, []);

    const handleLevelChange = React.useCallback((v: string) => {
        setLevel(v === FILTER_VALUES.ALL ? '' : v);
        setPage(1);
    }, []);

    const handleStartDateChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setStartDate(e.target.value);
        setPage(1);
    }, []);

    const handleEndDateChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setEndDate(e.target.value);
        setPage(1);
    }, []);

    const handleSearchChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSearch(e.target.value);
        setPage(1);
    }, []);

    const handlePrevPage = React.useCallback(() => {
        setPage(p => Math.max(1, p - 1));
    }, []);

    const handleNextPage = React.useCallback(() => {
        setPage(p => Math.min(totalPages, p + 1));
    }, [totalPages]);

    const handleSelectLog = React.useCallback((log: DataHubLog) => {
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
            const url = URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = `datahub-logs-${new Date().toISOString().split('T')[0]}.json`;
            downloadLink.click();
            URL.revokeObjectURL(url);
            toast.success(TOAST_LOG.EXPORT_SUCCESS);
        } catch {
            toast.error(TOAST_LOG.EXPORT_ERROR);
        }
    }, [logs]);

    if (logsQuery.isError) {
        return (
            <ErrorState
                title="Failed to load logs"
                message={logsQuery.error?.message || 'An unexpected error occurred'}
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
                        <span className="text-sm font-medium">Filters</span>
                    </div>
                    {runId && (
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-muted-foreground">Filtered by Run ID:</span>
                            <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-mono">
                                {runId}
                                <button type="button" onClick={handleClearRunId} className="ml-1 hover:text-destructive" aria-label="Clear run ID filter">
                                    <X className="h-3 w-3" />
                                </button>
                            </span>
                        </div>
                    )}
                    <div className="grid grid-cols-7 gap-3" data-testid="datahub-logs-filters">
                        <div className="relative">
                            <Hash className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={runId}
                                onChange={handleRunIdChange}
                                placeholder="Run ID..."
                                className="pl-9"
                                data-testid="datahub-logs-filter-run-id"
                                aria-label="Filter by run ID"
                            />
                        </div>
                        <Select value={pipelineId || FILTER_VALUES.ALL} onValueChange={handlePipelineChange}>
                            <SelectTrigger data-testid="datahub-logs-filter-pipeline">
                                <SelectValue placeholder="All Pipelines" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={FILTER_VALUES.ALL}>All Pipelines</SelectItem>
                                {pipelines.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={level || FILTER_VALUES.ALL} onValueChange={handleLevelChange}>
                            <SelectTrigger data-testid="datahub-logs-filter-level">
                                <SelectValue placeholder="All Levels" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={FILTER_VALUES.ALL}>All Levels</SelectItem>
                                <SelectItem value="DEBUG">DEBUG</SelectItem>
                                <SelectItem value="INFO">INFO</SelectItem>
                                <SelectItem value="WARN">WARN</SelectItem>
                                <SelectItem value="ERROR">ERROR</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="relative">
                            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="date"
                                value={startDate}
                                onChange={handleStartDateChange}
                                className="pl-9"
                                placeholder="Start date"
                                data-testid="datahub-logs-filter-start-date"
                            />
                        </div>

                        <div className="relative">
                            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="date"
                                value={endDate}
                                onChange={handleEndDateChange}
                                className="pl-9"
                                placeholder="End date"
                                data-testid="datahub-logs-filter-end-date"
                            />
                        </div>

                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={handleSearchChange}
                                placeholder="Search logs..."
                                className="pl-9"
                                data-testid="datahub-logs-search"
                            />
                        </div>

                        <div className="flex gap-2">
                            <Button variant="outline" size="icon" onClick={handleRefetch} disabled={logsQuery.isLoading} data-testid="datahub-logs-refresh-button" aria-label="Refresh logs">
                                <RefreshCw className={`w-4 h-4 ${logsQuery.isLoading ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button variant="outline" onClick={handleExport} disabled={logs.length === 0} data-testid="datahub-logs-export-button">
                                <Download className="w-4 h-4 mr-2" />
                                Export
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                            Log Entries ({totalItems.toLocaleString()})
                        </CardTitle>
                        <div className="flex items-center gap-2" data-testid="datahub-logs-pagination">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handlePrevPage}
                                disabled={page === 1}
                                data-testid="datahub-logs-prev-page"
                                aria-label="Previous page"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="text-sm text-muted-foreground">
                                Page {page} of {totalPages || 1}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleNextPage}
                                disabled={page >= totalPages}
                                data-testid="datahub-logs-next-page"
                                aria-label="Next page"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm" data-testid="datahub-logs-table">
                            <thead>
                                <tr className="bg-muted">
                                    <th className="text-left px-3 py-2 w-36">Time</th>
                                    <th className="text-left px-3 py-2 w-20">Level</th>
                                    <th className="text-left px-3 py-2 w-32">Pipeline</th>
                                    <th className="text-left px-3 py-2 w-24">Step</th>
                                    <th className="text-left px-3 py-2">Message</th>
                                    <th className="text-right px-3 py-2 w-20">Duration</th>
                                    <th className="text-right px-3 py-2 w-24">Records</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logsQuery.isLoading && logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-4">
                                            <LoadingState type="table" rows={10} message="Loading log entries..." />
                                        </td>
                                    </tr>
                                ) : logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                                            No log entries found
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
