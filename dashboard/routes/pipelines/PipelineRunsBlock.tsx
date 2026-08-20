import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Badge,
    Button,
    buttonVariants,
    DataTable,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
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
    PageLayout,
    usePermissions,
} from '@vendure/dashboard';
import { useNavigate } from '@tanstack/react-router';
import { ColumnDef, SortingState } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Eye, ScrollText, Play, XCircle, ShieldCheck } from 'lucide-react';
import { ErrorState, LoadingState } from '../../components/shared';
import { formatDateTime, isTerminalRunStatus } from '../../utils';
import {
    DATAHUB_PERMISSIONS,
    QUERY_LIMITS,
    ROUTES,
    RUN_STATUS,
    FILTER_VALUES,
    SELECT_WIDTHS,
    RUN_STATUS_TRANSLATION_IDS,
    getRunStatusBadgeVariant,
} from '../../constants';
import {
    usePipelineRuns,
    useCancelRun,
    useRunPipeline,
} from '../../hooks';
import { useOptionValues } from '../../hooks/api/use-config-options';
import { RunDetailsPanel } from './RunDetailsPanel';
import { normalizeRunMetrics } from './run-metrics';
import { getErrorMessage } from '../../../shared';
import type { RunRow } from '../../types';

type PipelineRunRow = Omit<RunRow, 'id'> & { id: string };

export function PipelineRunsBlock({
    pipelineId,
    canRunPublishedRevision,
    currentRevisionId,
}: {
    pipelineId?: string;
    canRunPublishedRevision: boolean;
    currentRevisionId?: string | number | null;
}) {
    const { i18n, t } = useLingui();
    const navigate = useNavigate();
    const locale = i18n.locale;
    const { hasPermissions } = usePermissions();
    const canViewRuns = hasPermissions([DATAHUB_PERMISSIONS.VIEW_RUNS]);
    const { options: statusOptions } = useOptionValues('runStatuses');
    const [page, setPage] = React.useState(1);
    const [itemsPerPage, setItemsPerPage] = React.useState<number>(QUERY_LIMITS.PAGINATION_DEFAULT);
    const [sorting, setSorting] = React.useState<SortingState>([
        { id: 'startedAt', desc: true },
    ]);
    const [status, setStatus] = React.useState<string>('');
    const [selectedRun, setSelectedRun] = React.useState<PipelineRunRow | null>(null);
    const [cancelConfirmRunId, setCancelConfirmRunId] = React.useState<string | null>(null);
    const [cancellingRunId, setCancellingRunId] = React.useState<string | null>(null);

    const sortVar = sorting.length
        ? { [sorting[0].id]: sorting[0].desc ? 'DESC' : 'ASC' }
        : undefined;

    const { data, isLoading, isError, error, refetch } = usePipelineRuns(canViewRuns ? pipelineId : undefined, {
        take: itemsPerPage,
        skip: (page - 1) * itemsPerPage,
        sort: sortVar as Record<string, 'ASC' | 'DESC'> | undefined,
        filter: status ? { status: { eq: status } } : undefined,
    });

    const cancelRun = useCancelRun();
    const runPipeline = useRunPipeline();
    const { mutate: cancelPipelineRun } = cancelRun;
    const { mutate: startPipelineRun } = runPipeline;

    const translateRunStatus = React.useCallback((value: string, fallback = value) => {
        const id = RUN_STATUS_TRANSLATION_IDS[
            value as keyof typeof RUN_STATUS_TRANSLATION_IDS
        ];
        return id ? i18n._(id) : fallback;
    }, [i18n]);

    const runs = React.useMemo<PipelineRunRow[]>(() => (
        (data?.items ?? []).map(run => ({
            ...run,
            id: String(run.id),
            metrics: normalizeRunMetrics(run.metrics),
        }))
    ), [data?.items]);
    const totalItems = data?.totalItems ?? 0;

    const handleSelectRun = React.useCallback((run: PipelineRunRow) => {
        setSelectedRun(run);
    }, []);

    const handleCancelRun = React.useCallback((runId: string) => {
        setCancelConfirmRunId(runId);
    }, []);

    const handleConfirmCancel = React.useCallback(() => {
        if (!cancelConfirmRunId) return;
        setCancellingRunId(cancelConfirmRunId);
        cancelPipelineRun(cancelConfirmRunId, {
            onSettled: () => {
                setCancellingRunId(null);
            },
        });
        setCancelConfirmRunId(null);
    }, [cancelConfirmRunId, cancelPipelineRun]);

    const handleStatusChange = React.useCallback((v: string | null) => {
        if (v == null) return;
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

    const handleRerun = React.useCallback((
        id: string,
        expectedRevisionId = currentRevisionId,
    ) => {
        if (expectedRevisionId == null) return;
        startPipelineRun({ pipelineId: id, expectedRevisionId }, {
            onSuccess: () => toast.success(
                t`Run started`,
            ),
        });
    }, [currentRevisionId, startPipelineRun, t]);

    const columns: ColumnDef<PipelineRunRow, unknown>[] = React.useMemo(() => [
        {
            id: 'id',
            header: 'ID',
            accessorFn: row => row.id,
            cell: ({ row }) => (
                <button
                    type="button"
                    className="font-mono text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => handleSelectRun(row.original)}
                    aria-label={t`View run ${row.original.id}`}
                >
                    {row.original.id}
                </button>
            ),
            enableSorting: false,
        },
        {
            id: 'status',
            header: t`Status`,
            accessorFn: row => row.status,
            cell: ({ row }) => {
                const st = row.original.status;
                const isPaused = st === RUN_STATUS.PAUSED;
                return (
                    <Badge
                        variant={getRunStatusBadgeVariant(st) as 'default' | 'secondary' | 'destructive' | 'outline'}
                        className={isPaused ? 'border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30' : undefined}
                    >
                        {isPaused
                            ? <Trans>Awaiting approval</Trans>
                            : translateRunStatus(st)}
                    </Badge>
                );
            },
        },
        {
            id: 'startedAt',
            header: t`Started`,
            accessorFn: row => row.startedAt ?? '',
            cell: ({ row }) => formatDateTime(row.original.startedAt, undefined, locale),
        },
        {
            id: 'finishedAt',
            header: t`Finished`,
            accessorFn: row => row.finishedAt ?? '',
            cell: ({ row }) => formatDateTime(row.original.finishedAt, undefined, locale),
        },
        {
            id: 'processed',
            header: t`Processed`,
            accessorFn: row => Number((row.metrics?.processed ?? 0)),
            cell: ({ row }) => Number(row.original.metrics?.processed ?? 0),
            enableSorting: false,
        },
        {
            id: 'actions',
            header: t`Actions`,
            cell: ({ row }) => {
                const st = row.original.status;
                const isFinished = isTerminalRunStatus(st);
                const canCancel = st === RUN_STATUS.RUNNING || st === RUN_STATUS.PENDING;
                const isPaused = st === RUN_STATUS.PAUSED;

                return (
                    <div className="flex items-center gap-0.5">
                        <Tooltip>
                            <TooltipTrigger
                                className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'h-7 w-7' })}
                                onClick={() => handleSelectRun(row.original)}
                                aria-label={t`View details`}
                            >
                                <Eye className="h-3.5 w-3.5" />
                            </TooltipTrigger>
                            <TooltipContent><Trans>View details</Trans></TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger
                                className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'h-7 w-7' })}
                                onClick={() => void navigate({
                                    to: ROUTES.LOGS,
                                    search: { runId: String(row.original.id) },
                                })}
                                aria-label={t`View logs`}
                            >
                                <ScrollText className="h-3.5 w-3.5" />
                            </TooltipTrigger>
                            <TooltipContent><Trans>View logs</Trans></TooltipContent>
                        </Tooltip>

                        {isPaused && (
                            <Tooltip>
                                <TooltipTrigger
                                    className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'h-7 w-7 text-amber-600 dark:text-amber-400' })}
                                    onClick={() => handleSelectRun(row.original)}
                                    aria-label={t`Approve gate`}
                                >
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                </TooltipTrigger>
                                <TooltipContent><Trans>Approve gate</Trans></TooltipContent>
                            </Tooltip>
                        )}

                        {isFinished && pipelineId && canRunPublishedRevision && (
                            <PermissionGuard requires={[DATAHUB_PERMISSIONS.RUN_PIPELINE]}>
                                <Tooltip>
                                    <TooltipTrigger
                                        className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'h-7 w-7' })}
                                        onClick={() => handleRerun(pipelineId)}
                                        aria-label={t`Re-run pipeline`}
                                    >
                                        <Play className="h-3.5 w-3.5" />
                                    </TooltipTrigger>
                                    <TooltipContent><Trans>Re-run pipeline</Trans></TooltipContent>
                                </Tooltip>
                            </PermissionGuard>
                        )}

                        {canCancel && (
                            <PermissionGuard requires={[DATAHUB_PERMISSIONS.RUN_PIPELINE]}>
                                <Tooltip>
                                    <TooltipTrigger
                                        className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'h-7 w-7 text-destructive' })}
                                        onClick={() => handleCancelRun(row.original.id)}
                                        disabled={cancellingRunId === row.original.id}
                                        aria-label={t`Cancel run`}
                                    >
                                        <XCircle className="h-3.5 w-3.5" />
                                    </TooltipTrigger>
                                    <TooltipContent><Trans>Cancel run</Trans></TooltipContent>
                                </Tooltip>
                            </PermissionGuard>
                        )}
                    </div>
                );
            },
            enableSorting: false,
        },
    ], [
        cancellingRunId,
        canRunPublishedRevision,
        handleCancelRun,
        handleRerun,
        handleSelectRun,
        locale,
        navigate,
        pipelineId,
        t,
        translateRunStatus,
    ]);

    let content: React.ReactNode;

    if (isError && !data) {
        content = (
            <PageBlock column="main" blockId="runs-error">
                <ErrorState
                    title={t`Failed to load pipeline runs`}
                    message={getErrorMessage(error)}
                    onRetry={() => refetch()}
                />
            </PageBlock>
        );
    } else if (isLoading && runs.length === 0) {
        content = (
            <PageBlock column="main" blockId="runs-loading">
                <LoadingState
                    type="table"
                    rows={5}
                    message={t`Loading pipeline runs...`}
                />
            </PageBlock>
        );
    } else {
        content = (
            <PageBlock column="main" blockId="runs">
                <div className="mb-2 flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
                    <h3 className="text-base font-semibold">
                        <Trans>Runs</Trans>
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <Select value={status || FILTER_VALUES.ALL} onValueChange={handleStatusChange}>
                            <SelectTrigger className={SELECT_WIDTHS.RUN_STATUS} data-testid="datahub-run-status-filter">
                                <SelectValue placeholder={t`All statuses`} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={FILTER_VALUES.ALL}>
                                    <Trans>All</Trans>
                                </SelectItem>
                                {statusOptions.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {translateRunStatus(opt.value, opt.label)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button variant="ghost" onClick={() => refetch()} disabled={isLoading} data-testid="datahub-run-history-refresh-button">
                            <Trans>Refresh</Trans>
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
        );
    }

    return (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.VIEW_RUNS]}>
            <div id="runs">
                <PageLayout>
                    {content}
                </PageLayout>
                <Drawer open={!!selectedRun} onOpenChange={handleCloseDrawer}>
                    <DrawerContent>
                        <DrawerHeader>
                            <DrawerTitle>
                                <Trans>Run details</Trans>
                            </DrawerTitle>
                            <DrawerDescription>
                                {selectedRun
                                    ? <Trans>Run {selectedRun.id}</Trans>
                                    : <Trans>Details</Trans>}
                            </DrawerDescription>
                        </DrawerHeader>
                        {selectedRun && (
                            <RunDetailsPanel
                                runId={selectedRun.id}
                                initialData={selectedRun}
                                onCancel={handleCancelRun}
                                onRerun={handleRerun}
                                canRerun={canRunPublishedRevision}
                                isCancelling={cancellingRunId === selectedRun.id}
                            />
                        )}
                    </DrawerContent>
                </Drawer>
                <AlertDialog open={!!cancelConfirmRunId} onOpenChange={(open) => { if (!open) setCancelConfirmRunId(null); }}>
                    <AlertDialogContent className="max-w-md">
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                <Trans>Cancel pipeline run</Trans>
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                <Trans>This will request cancellation of the running pipeline. This action cannot be undone.</Trans>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>
                                <Trans>Keep running</Trans>
                            </AlertDialogCancel>
                            <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={handleConfirmCancel}
                            >
                                <Trans>Cancel run</Trans>
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </PermissionGuard>
    );
}
