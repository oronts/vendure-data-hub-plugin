import * as React from 'react';
import {
    Badge,
    Button,
    DataTable,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    PageBlock,
    PermissionGuard,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerDescription,
} from '@vendure/dashboard';
import { Link } from '@tanstack/react-router';
import { ColumnDef, SortingState } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Eye, ScrollText, Play, XCircle, ShieldCheck } from 'lucide-react';
import { ErrorState, LoadingState } from '../../components/shared';
import { formatDateTime } from '../../utils';
import {
    DATAHUB_PERMISSIONS,
    QUERY_LIMITS,
    ROUTES,
    RUN_STATUS,
    FILTER_VALUES,
    SELECT_WIDTHS,
    TOAST_PIPELINE,
    getRunStatusBadgeVariant,
} from '../../constants';
import {
    usePipelineRuns,
    useCancelRun,
    useRunPipeline,
    handleMutationError,
} from '../../hooks';
import { useOptionValues } from '../../hooks/api/use-config-options';
import { RunDetailsPanel } from './RunDetailsPanel';
import { getErrorMessage } from '../../../shared';
import type { RunRow } from '../../types';

/**
 * Terminal run statuses — intentionally hardcoded rather than derived from backend.
 * These are a fundamental system invariant: a run is either still in progress or it has
 * reached one of these four terminal states. Adding `isFinished` metadata to the GraphQL
 * `DataHubOptionValue` type would require schema + codegen changes for no practical benefit,
 * since the set of terminal statuses is fixed by the execution engine contract.
 */
const FINISHED_STATUSES = [RUN_STATUS.COMPLETED, RUN_STATUS.FAILED, RUN_STATUS.CANCELLED, RUN_STATUS.TIMEOUT] as string[];

export function PipelineRunsBlock({ pipelineId }: { pipelineId?: string }) {
    const { options: statusOptions } = useOptionValues('runStatuses');
    const [page, setPage] = React.useState(1);
    const [itemsPerPage, setItemsPerPage] = React.useState(QUERY_LIMITS.PAGINATION_DEFAULT);
    const [sorting, setSorting] = React.useState<SortingState>([
        { id: 'startedAt', desc: true },
    ]);
    const [status, setStatus] = React.useState<string>('');
    const [selectedRun, setSelectedRun] = React.useState<RunRow | null>(null);
    const [cancelConfirmRunId, setCancelConfirmRunId] = React.useState<string | null>(null);
    const [cancellingRunId, setCancellingRunId] = React.useState<string | null>(null);

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
        setCancelConfirmRunId(runId);
    }, []);

    const handleConfirmCancel = React.useCallback(() => {
        if (!cancelConfirmRunId) return;
        setCancellingRunId(cancelConfirmRunId);
        cancelRun.mutate(cancelConfirmRunId, {
            onSettled: () => {
                setCancellingRunId(null);
            },
        });
        setCancelConfirmRunId(null);
    }, [cancelConfirmRunId, cancelRun.mutate]);

    const handleStatusChange = React.useCallback((v: string) => {
        setPage(1);
        setStatus(v === FILTER_VALUES.ALL ? '' : v);
    }, []);

    const handlePageChange = React.useCallback((_table: unknown, newPage: number, newItemsPerPage: number) => {
        setPage(newPage);
        setItemsPerPage(newItemsPerPage);
    }, []);

    const handleSortChange = React.useCallback((_table: unknown, newSorting: SortingState) => {
        setSorting(newSorting);
    }, []);

    const handleCloseDrawer = React.useCallback((open: boolean) => {
        if (!open) setSelectedRun(null);
    }, []);

    const handleOnRerun = React.useCallback((id: string) => {
        runPipeline.mutate(id, {
            onSuccess: () => toast.success(TOAST_PIPELINE.RUN_STARTED),
            onError: (err) => handleMutationError('start pipeline run', err),
        });
    }, [runPipeline.mutate]);

    const columns: ColumnDef<RunRow, unknown>[] = React.useMemo(() => [
        {
            id: 'id',
            header: 'ID',
            accessorFn: row => row.id,
            cell: ({ row }) => (
                <button
                    type="button"
                    className="font-mono text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => handleSelectRun(row.original)}
                    aria-label={`View run ${row.original.id}`}
                >
                    {row.original.id}
                </button>
            ),
            enableSorting: false,
        },
        {
            id: 'status',
            header: 'Status',
            accessorFn: row => row.status,
            cell: ({ row }) => {
                const st = row.original.status;
                const isPaused = st === RUN_STATUS.PAUSED;
                return (
                    <Badge
                        variant={getRunStatusBadgeVariant(st) as 'default' | 'secondary' | 'destructive' | 'outline'}
                        className={isPaused ? 'border-amber-400 text-amber-700 bg-amber-50' : undefined}
                    >
                        {isPaused ? 'AWAITING APPROVAL' : st}
                    </Badge>
                );
            },
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
                const isFinished = FINISHED_STATUSES.includes(st);
                const canCancel = st === RUN_STATUS.RUNNING || st === RUN_STATUS.PENDING;
                const isPaused = st === RUN_STATUS.PAUSED;

                return (
                    <div className="flex items-center gap-0.5">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSelectRun(row.original)} aria-label="View details">
                                    <Eye className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>View details</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                    <Link to={`${ROUTES.LOGS}?runId=${row.original.id}`} aria-label="View logs">
                                        <ScrollText className="h-3.5 w-3.5" />
                                    </Link>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>View logs</TooltipContent>
                        </Tooltip>

                        {isPaused && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600" onClick={() => handleSelectRun(row.original)} aria-label="Approve gate">
                                        <ShieldCheck className="h-3.5 w-3.5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Approve gate</TooltipContent>
                            </Tooltip>
                        )}

                        {isFinished && pipelineId && (
                            <PermissionGuard requires={[DATAHUB_PERMISSIONS.RUN_PIPELINE]}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOnRerun(pipelineId)} aria-label="Re-run pipeline">
                                            <Play className="h-3.5 w-3.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Re-run pipeline</TooltipContent>
                                </Tooltip>
                            </PermissionGuard>
                        )}

                        {canCancel && (
                            <PermissionGuard requires={[DATAHUB_PERMISSIONS.RUN_PIPELINE]}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleCancelRun(row.original.id)} disabled={cancellingRunId === row.original.id} aria-label="Cancel run">
                                            <XCircle className="h-3.5 w-3.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Cancel run</TooltipContent>
                                </Tooltip>
                            </PermissionGuard>
                        )}
                    </div>
                );
            },
            enableSorting: false,
        },
    ], [handleSelectRun, handleCancelRun, handleOnRerun, cancellingRunId, pipelineId]);

    let content: React.ReactNode;

    if (isError && !data) {
        content = (
            <PageBlock column="main" blockId="runs-error">
                <ErrorState
                    title="Failed to load pipeline runs"
                    message={getErrorMessage(error)}
                    onRetry={() => refetch()}
                />
            </PageBlock>
        );
    } else if (isLoading && runs.length === 0) {
        content = (
            <PageBlock column="main" blockId="runs-loading">
                <LoadingState type="table" rows={5} message="Loading pipeline runs..." />
            </PageBlock>
        );
    } else {
        content = (
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
                                    {statusOptions.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button variant="ghost" onClick={() => refetch()} disabled={isLoading} data-testid="datahub-run-history-refresh-button">
                                Refresh
                            </Button>
                        </div>
                    </div>
                    <TooltipProvider>
                        <DataTable
                            columns={columns}
                            data={runs}
                            totalItems={totalItems}
                            isLoading={isLoading}
                            page={page}
                            itemsPerPage={itemsPerPage}
                            sorting={sorting}
                            onPageChange={handlePageChange}
                            onSortChange={handleSortChange}
                            onRefresh={refetch}
                            disableViewOptions
                            data-testid="datahub-run-history-table"
                        />
                    </TooltipProvider>
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
                                isCancelling={cancellingRunId === selectedRun.id}
                            />
                        )}
                    </DrawerContent>
                </Drawer>
                <Dialog open={!!cancelConfirmRunId} onOpenChange={(open) => { if (!open) setCancelConfirmRunId(null); }}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Cancel Pipeline Run</DialogTitle>
                            <DialogDescription>
                                This will request cancellation of the running pipeline. This action cannot be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setCancelConfirmRunId(null)}
                            >
                                Keep Running
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleConfirmCancel}
                            >
                                Cancel Run
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </>
        );
    }

    return (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.VIEW_RUNS]}>
            <div id="runs">
                {content}
            </div>
        </PermissionGuard>
    );
}
