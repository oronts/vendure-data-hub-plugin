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
    RefreshCw,
    Search,
} from 'lucide-react';
import {
    useLogs,
    usePipelines,
} from '../../../hooks';
import { ErrorState } from '../../../components/shared';
import { QUERY_LIMITS, UI_DEFAULTS, FILTER_VALUES, TOAST_LOG } from '../../../constants';
import { LogTableRow } from './LogTableRow';
import { LogDetailDrawer } from './LogDetailDrawer';
import type { DataHubLogListOptions, DataHubLog } from '../../../types';

/**
 * Log explorer tab with filters, table, and export functionality.
 * Allows filtering by pipeline, level, date range, and message search.
 */
export function LogExplorerTab() {
    const [pipelineId, setPipelineId] = React.useState<string>('');
    const [level, setLevel] = React.useState<string>('');
    const [search, setSearch] = React.useState<string>('');
    const [startDate, setStartDate] = React.useState<string>('');
    const [endDate, setEndDate] = React.useState<string>('');
    const [page, setPage] = React.useState(1);
    const [selectedLog, setSelectedLog] = React.useState<DataHubLog | null>(null);
    const pageSize = UI_DEFAULTS.LOG_EXPLORER_PAGE_SIZE;

    const pipelinesQuery = usePipelines({ take: QUERY_LIMITS.ALL_ITEMS });

    const buildFilter = (): DataHubLogListOptions['filter'] => {
        const filter: DataHubLogListOptions['filter'] = {};
        if (pipelineId) {
            filter.pipelineId = { eq: pipelineId };
        }
        if (level) {
            filter.level = { eq: level };
        }
        if (search) {
            filter.message = { contains: search };
        }
        if (startDate) {
            filter.createdAt = { ...(filter.createdAt || {}), after: new Date(startDate).toISOString() };
        }
        if (endDate) {
            filter.createdAt = { ...(filter.createdAt || {}), before: new Date(endDate).toISOString() };
        }
        return Object.keys(filter).length > 0 ? filter : undefined;
    };

    const logsQuery = useLogs({
        filter: buildFilter(),
        sort: { createdAt: 'DESC' },
        skip: (page - 1) * pageSize,
        take: pageSize,
    });

    const logs = logsQuery.data?.items ?? [];
    const totalItems = logsQuery.data?.totalItems ?? 0;
    const totalPages = Math.ceil(totalItems / pageSize);
    const pipelines = pipelinesQuery.data?.items ?? [];

    const handleRefetch = React.useCallback(() => logsQuery.refetch(), [logsQuery]);

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
            const a = document.createElement('a');
            a.href = url;
            a.download = `datahub-logs-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
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
                    <div className="grid grid-cols-6 gap-3">
                        <Select value={pipelineId || FILTER_VALUES.ALL} onValueChange={handlePipelineChange}>
                            <SelectTrigger>
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
                            <SelectTrigger>
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
                            />
                        </div>

                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={handleSearchChange}
                                placeholder="Search logs..."
                                className="pl-9"
                            />
                        </div>

                        <div className="flex gap-2">
                            <Button variant="outline" size="icon" onClick={handleRefetch} disabled={logsQuery.isLoading}>
                                <RefreshCw className={`w-4 h-4 ${logsQuery.isLoading ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button variant="outline" onClick={handleExport} disabled={logs.length === 0}>
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
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handlePrevPage}
                                disabled={page === 1}
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
                            >
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
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
                                {logs.map((log) => (
                                    <LogTableRow
                                        key={log.id}
                                        log={log}
                                        onSelect={handleSelectLog}
                                    />
                                ))}
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                                            {logsQuery.isLoading ? 'Loading...' : 'No log entries found'}
                                        </td>
                                    </tr>
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
