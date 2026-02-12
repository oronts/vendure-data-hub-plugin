import * as React from 'react';
import {
    Button,
    DataTable,
    PageBlock,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerDescription,
} from '@vendure/dashboard';
import { ColumnDef, SortingState } from '@tanstack/react-table';
import { toast } from 'sonner';
import { ErrorState, LoadingState } from '../../components/shared';
import { formatDateTime } from '../../utils/formatters';
import { QUERY_LIMITS, RUN_STATUS, FILTER_VALUES, SELECT_WIDTHS, TOAST_PIPELINE } from '../../constants';
import {
    usePipelineRuns,
    useCancelRun,
    useRunPipeline,
    handleMutationError,
} from '../../hooks';
import { RunDetailsPanel } from './RunDetailsPanel';
import type { RunRow } from '../../types';

export function PipelineRunsBlock({ pipelineId }: { pipelineId?: string }) {
    const [page, setPage] = React.useState(1);
    const [itemsPerPage, setItemsPerPage] = React.useState(QUERY_LIMITS.PAGINATION_DEFAULT);
    const [sorting, setSorting] = React.useState<SortingState>([
        { id: 'startedAt', desc: true },
    ]);
    const [status, setStatus] = React.useState<string>('');
    const [selectedRun, setSelectedRun] = React.useState<RunRow | null>(null);

    const sortVar = sorting.length
        ? { [sorting[0].id]: sorting[0].desc ? 'DESC' : 'ASC' }
        : undefined;

    const { data, isLoading, isError, error, refetch } = usePipelineRuns(pipelineId, {
        take: itemsPerPage,
        skip: (page - 1) * itemsPerPage,
        sort: sortVar as Record<string, 'ASC' | 'DESC'> | undefined,
        filter: status ? { status: { eq: status } } : undefined,
    });

    const cancelRun = useCancelRun();
    const runPipeline = useRunPipeline();

    const runs: RunRow[] = data?.items ?? [];
    const totalItems = data?.totalItems ?? 0;

    const handleSelectRun = React.useCallback((run: RunRow) => {
        setSelectedRun(run);
    }, []);

    const handleCancelRun = React.useCallback((runId: string) => {
        cancelRun.mutate(runId);
    }, [cancelRun.mutate]);

    const handleStatusChange = React.useCallback((v: string) => {
        setPage(1);
        setStatus(v === FILTER_VALUES.ALL ? '' : v);
    }, []);

    const handleCloseDrawer = React.useCallback((open: boolean) => {
        if (!open) setSelectedRun(null);
    }, []);

    const handleOnRerun = React.useCallback((pipelineId: string) => {
        runPipeline.mutate(pipelineId, {
            onSuccess: () => toast.success(TOAST_PIPELINE.RUN_STARTED),
            onError: (err) => handleMutationError('start pipeline run', err),
        });
    }, [runPipeline.mutate]);

    const columns: ColumnDef<RunRow, unknown>[] = React.useMemo(() => [
        {
            id: 'id',
            header: 'ID',
            accessorFn: row => row.id,
            cell: ({ row }) => {
                const handleClick = () => handleSelectRun(row.original);
                return (
                    <button
                        className="font-mono text-muted-foreground underline-offset-2 hover:underline"
                        onClick={handleClick}
                    >
                        {row.original.id}
                    </button>
                );
            },
            enableSorting: false,
        },
        {
            id: 'status',
            header: 'Status',
            accessorFn: row => row.status,
            cell: ({ row }) => row.original.status,
        },
        {
            id: 'startedAt',
            header: 'Started',
            accessorFn: row => row.startedAt ?? '',
            cell: ({ row }) => formatDateTime(row.original.startedAt),
        },
        {
            id: 'finishedAt',
            header: 'Finished',
            accessorFn: row => row.finishedAt ?? '',
            cell: ({ row }) => formatDateTime(row.original.finishedAt),
        },
        {
            id: 'processed',
            header: 'Processed',
            accessorFn: row => Number((row.metrics?.processed ?? 0)),
            cell: ({ row }) => Number(row.original.metrics?.processed ?? 0),
            enableSorting: false,
        },
        {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }) => {
                const st = row.original.status;
                const canCancel = st === RUN_STATUS.RUNNING || st === RUN_STATUS.PENDING;
                const handleClick = () => handleCancelRun(row.original.id);
                return canCancel ? (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleClick}
                        disabled={cancelRun.isPending}
                        data-testid="datahub-run-cancel-button"
                    >
                        Cancel
                    </Button>
                ) : (
                    <span className="text-muted-foreground">—</span>
                );
            },
            enableSorting: false,
        },
    ], [handleSelectRun, handleCancelRun, cancelRun.isPending]);

    if (isError && !data) {
        return (
            <PageBlock column="main" blockId="runs-error">
                <ErrorState
                    title="Failed to load pipeline runs"
                    message={error instanceof Error ? error.message : 'An unknown error occurred'}
                    onRetry={() => refetch()}
                />
            </PageBlock>
        );
    }

    if (isLoading && runs.length === 0) {
        return (
            <PageBlock column="main" blockId="runs-loading">
                <LoadingState type="table" rows={5} message="Loading pipeline runs..." />
            </PageBlock>
        );
    }

    return (
        <>
            <PageBlock column="main" blockId="runs">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-semibold">Runs</h3>
                    <div className="flex items-center gap-2">
                        <Select value={status || FILTER_VALUES.ALL} onValueChange={handleStatusChange}>
                            <SelectTrigger className={SELECT_WIDTHS.RUN_STATUS} data-testid="datahub-run-status-filter">
                                <SelectValue placeholder="All statuses" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={FILTER_VALUES.ALL}>All</SelectItem>
                                <SelectItem value={RUN_STATUS.PENDING}>Pending</SelectItem>
                                <SelectItem value={RUN_STATUS.RUNNING}>Running</SelectItem>
                                <SelectItem value={RUN_STATUS.COMPLETED}>Completed</SelectItem>
                                <SelectItem value={RUN_STATUS.FAILED}>Failed</SelectItem>
                                <SelectItem value={RUN_STATUS.CANCEL_REQUESTED}>Cancel requested</SelectItem>
                                <SelectItem value={RUN_STATUS.CANCELLED}>Cancelled</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="ghost" onClick={() => refetch()} disabled={isLoading} data-testid="datahub-run-history-refresh-button">
                            Refresh
                        </Button>
                    </div>
                </div>
                <DataTable
                    columns={columns}
                    data={runs}
                    totalItems={totalItems}
                    isLoading={isLoading}
                    page={page}
                    itemsPerPage={itemsPerPage}
                    sorting={sorting}
                    onPageChange={setPage}
                    onSortChange={setSorting}
                    onRefresh={refetch}
                    disableViewOptions
                    data-testid="datahub-run-history-table"
                />
            </PageBlock>
            <Drawer open={!!selectedRun} onOpenChange={handleCloseDrawer}>
                <DrawerContent>
                    <DrawerHeader>
                        <DrawerTitle>Run details</DrawerTitle>
                        <DrawerDescription>
                            {selectedRun ? `Run ${selectedRun.id}` : 'Details'}
                        </DrawerDescription>
                    </DrawerHeader>
                    {selectedRun && (
                        <RunDetailsPanel
                            runId={selectedRun.id}
                            initialData={selectedRun}
                            onCancel={handleCancelRun}
                            onRerun={handleOnRerun}
                            isCancelling={cancelRun.isPending}
                        />
                    )}
                </DrawerContent>
            </Drawer>
        </>
    );
}
