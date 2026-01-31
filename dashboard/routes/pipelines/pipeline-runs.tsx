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
    PermissionGuard,
    Input,
    Json,
} from '@vendure/dashboard';
import { ColumnDef, SortingState } from '@tanstack/react-table';
import { toast } from 'sonner';
import { ErrorState, LoadingState } from '../../components/shared';
import { formatDateTime } from '../../utils/formatters';
import { QUERY_LIMITS, DATAHUB_PERMISSIONS, RUN_STATUS, FILTER_VALUES, SELECT_WIDTHS, TOAST_PIPELINE } from '../../constants';
import {
    usePipelineRuns,
    usePipelineRun,
    useRunErrors,
    useErrorAudits,
    useCancelRun,
    useRetryError,
    useRunPipeline,
    handleMutationError,
} from '../../hooks';
import type {
    IndividualRunMetrics,
    StepMetricsDetail,
    RunRow,
    RunDetailsPanelProps,
    RunErrorsListProps,
} from '../../types';

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
    }, [cancelRun]);

    const handleStatusChange = React.useCallback((v: string) => {
        setPage(1);
        setStatus(v === FILTER_VALUES.ALL ? '' : v);
    }, []);

    const handleCloseDrawer = React.useCallback((open: boolean) => {
        if (!open) setSelectedRun(null);
    }, []);

    const handleOnCancel = React.useCallback((id: string) => {
        cancelRun.mutate(id);
    }, [cancelRun]);

    const handleOnRerun = React.useCallback((pipelineId: string) => {
        runPipeline.mutate(pipelineId, {
            onSuccess: () => toast.success(TOAST_PIPELINE.RUN_STARTED),
            onError: (err) => handleMutationError('start pipeline run', err),
        });
    }, [runPipeline]);

    const columns: ColumnDef<RunRow, unknown>[] = React.useMemo(() => [
        {
            id: 'id',
            header: 'ID',
            accessorFn: row => row.id,
            cell: ({ row }) => (
                <button
                    className="font-mono text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => handleSelectRun(row.original)}
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
                return canCancel ? (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCancelRun(row.original.id)}
                        disabled={cancelRun.isPending}
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
                            <SelectTrigger className={SELECT_WIDTHS.RUN_STATUS}>
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
                        <Button variant="ghost" onClick={() => refetch()} disabled={isLoading}>
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
                            onCancel={handleOnCancel}
                            onRerun={handleOnRerun}
                            isCancelling={cancelRun.isPending}
                        />
                    )}
                </DrawerContent>
            </Drawer>
        </>
    );
}

function RunDetailsPanel({ runId, initialData, onCancel, onRerun, isCancelling }: RunDetailsPanelProps) {
    const { data: runData, refetch, isFetching } = usePipelineRun(runId);
    const { data: errors } = useRunErrors(runId);
    const retryError = useRetryError();

    const d = runData;
    const status = d?.status ?? initialData.status;
    const metrics: IndividualRunMetrics = (d?.metrics as IndividualRunMetrics) ?? initialData.metrics ?? {};
    const processed = Number(metrics.processed ?? 0);
    const succeeded = Number(metrics.succeeded ?? 0);
    const failed = Number(metrics.failed ?? 0);
    const summary = `${processed} processed • ${succeeded} succeeded • ${failed} failed`;

    const handleRetry = React.useCallback(async (errorId: string, patch: Record<string, unknown>) => {
        try {
            await retryError.mutateAsync({ errorId, patch });
            toast.success(TOAST_PIPELINE.RECORD_RETRY_QUEUED);
        } catch (err) {
            handleMutationError('retry record', err);
        }
    }, [retryError]);

    const handleCancel = React.useCallback(() => {
        onCancel(d?.id ?? runId);
    }, [onCancel, d?.id, runId]);

    const handleRerun = React.useCallback(() => {
        onRerun(String(d!.pipeline!.id));
    }, [onRerun, d]);

    return (
        <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
                <div className="text-sm">Status: {status}</div>
                <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
                    Refresh
                </Button>
            </div>
            <div className="text-sm text-muted-foreground">{summary}</div>
            <div className="text-xs text-muted-foreground">Started by: {d?.startedByUserId ?? '—'}</div>

            <StepCounters metrics={metrics} />
            <StepSummaryTable metrics={metrics} />

            <div>
                <div className="text-sm font-medium mb-1">Metrics</div>
                <Json value={d?.metrics ?? initialData.metrics ?? {}} />
            </div>
            <div className="text-sm">
                <div className="text-sm font-medium mb-1">Started</div>
                <div>{formatDateTime(d?.startedAt ?? initialData.startedAt)}</div>
            </div>
            <div className="text-sm">
                <div className="text-sm font-medium mb-1">Finished</div>
                <div>{formatDateTime(d?.finishedAt ?? initialData.finishedAt)}</div>
            </div>

            {d?.error && (
                <div className="text-sm">
                    <div className="text-sm font-medium mb-1">Error</div>
                    <pre className="bg-muted p-3 rounded text-xs overflow-auto">{String(d.error)}</pre>
                </div>
            )}

            {(status === RUN_STATUS.RUNNING || status === RUN_STATUS.PENDING) && (
                <Button variant="secondary" onClick={handleCancel} disabled={isCancelling}>
                    Cancel run
                </Button>
            )}

            {d?.pipeline?.id && (
                <Button variant="outline" onClick={handleRerun}>
                    Re-run
                </Button>
            )}

            <div className="mt-4">
                <div className="text-sm font-medium mb-1">Record errors</div>
                <div className="text-sm text-muted-foreground mb-2">Failed records captured during this run</div>
                <PermissionGuard requires={[DATAHUB_PERMISSIONS.VIEW_QUARANTINE]}>
                    <RunErrorsList
                        runId={runId}
                        items={errors ?? []}
                        onRetry={handleRetry}
                    />
                </PermissionGuard>
            </div>
        </div>
    );
}

function StepCounters({ metrics }: { metrics: IndividualRunMetrics }) {
    const details: StepMetricsDetail[] = Array.isArray(metrics?.details) ? metrics.details : [];
    const countersObj = details.find(x => x && typeof x === 'object' && x.counters);
    if (!countersObj?.counters) return null;

    return (
        <div className="mt-2">
            <div className="text-sm font-medium mb-1">Counters</div>
            <table className="text-sm">
                <tbody>
                    {Object.entries(countersObj.counters).map(([k, v]) => (
                        <tr key={k}>
                            <td className="pr-3 text-muted-foreground">{k}</td>
                            <td>{String(v)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function StepSummaryTable({ metrics }: { metrics: IndividualRunMetrics }) {
    const details: StepMetricsDetail[] = Array.isArray(metrics?.details) ? metrics.details : [];
    if (!details.length) return null;

    return (
        <div className="mt-2">
            <div className="text-sm font-medium mb-1">Step summary</div>
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-muted">
                        <th className="text-left px-2 py-1">Step</th>
                        <th className="text-left px-2 py-1">Type</th>
                        <th className="text-left px-2 py-1">Adapter</th>
                        <th className="text-left px-2 py-1">Out/OK/Fail</th>
                        <th className="text-left px-2 py-1">Duration</th>
                    </tr>
                </thead>
                <tbody>
                    {/* stepKey is unique within a run, safe to use as key */}
                    {details.map((s) => (
                        <tr key={s.stepKey} className="border-t">
                            <td className="px-2 py-1 font-mono text-muted-foreground">{s.stepKey}</td>
                            <td className="px-2 py-1">{s.type}</td>
                            <td className="px-2 py-1">{s.adapterCode ?? '—'}</td>
                            <td className="px-2 py-1">{s.ok ?? 0}{typeof s.fail === 'number' ? ` / ${s.fail}` : ''}</td>
                            <td className="px-2 py-1">{typeof s.durationMs === 'number' ? `${s.durationMs} ms` : '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function RunErrorsList({ runId, items, onRetry }: RunErrorsListProps) {
    const [editing, setEditing] = React.useState<{ id: string; patch: string } | null>(null);

    const handleStartEditing = React.useCallback((itemId: string) => {
        setEditing({ id: itemId, patch: '{}' });
    }, []);

    const handlePatchChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setEditing(prev => prev ? { ...prev, patch: e.target.value } : null);
    }, []);

    const handlePatchHelperChange = React.useCallback((p: Record<string, unknown>) => {
        setEditing(prev => prev ? { ...prev, patch: JSON.stringify(p, null, 2) } : null);
    }, []);

    const handleRetryClick = React.useCallback(async () => {
        if (!editing) return;
        try {
            const patch = JSON.parse(editing.patch);
            await onRetry(editing.id, patch);
            setEditing(null);
        } catch {
            toast.error(TOAST_PIPELINE.INVALID_JSON_PATCH);
        }
    }, [editing, onRetry]);

    const handleCancelEditing = React.useCallback(() => {
        setEditing(null);
    }, []);

    if (items.length === 0) {
        return <div className="text-sm text-muted-foreground">No record errors</div>;
    }

    return (
        <div className="space-y-2">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-muted">
                        <th className="text-left px-2 py-1">Step</th>
                        <th className="text-left px-2 py-1">Message</th>
                        <th className="text-left px-2 py-1">Payload</th>
                        <th className="text-left px-2 py-1">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(item => (
                        <ErrorRow
                            key={item.id}
                            item={item}
                            onStartEditing={handleStartEditing}
                        />
                    ))}
                </tbody>
            </table>
            {editing && (
                <div className="border rounded p-2 space-y-2">
                    <div className="text-sm font-medium">Patch JSON</div>
                    <textarea
                        className="w-full h-32 font-mono p-2 border rounded"
                        value={editing.patch}
                        onChange={handlePatchChange}
                    />
                    <RetryPatchHelper onChange={handlePatchHelperChange} />
                    <div className="flex items-center gap-2">
                        <Button size="sm" onClick={handleRetryClick}>
                            Retry
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleCancelEditing}>Cancel</Button>
                    </div>
                </div>
            )}
        </div>
    );
}

interface ErrorRowProps {
    item: { id: string; stepKey?: string | null; message?: string | null; payload?: unknown };
    onStartEditing: (itemId: string) => void;
}

function ErrorRow({ item, onStartEditing }: ErrorRowProps) {
    const handleClick = React.useCallback(() => {
        onStartEditing(item.id);
    }, [onStartEditing, item.id]);

    return (
        <tr className="border-t align-top">
            <td className="px-2 py-1 font-mono text-muted-foreground">{item.stepKey}</td>
            <td className="px-2 py-1">{item.message}</td>
            <td className="px-2 py-1 align-top">
                <Json value={item.payload} />
                <ErrorAuditList errorId={item.id} />
            </td>
            <td className="px-2 py-1 align-top">
                <PermissionGuard requires={[DATAHUB_PERMISSIONS.REPLAY_RECORD]}>
                    <Button variant="outline" size="sm" onClick={handleClick}>
                        Retry with patch
                    </Button>
                </PermissionGuard>
            </td>
        </tr>
    );
}

function RetryPatchHelper({ onChange }: { onChange: (p: Record<string, unknown>) => void }) {
    const [values, setValues] = React.useState<Record<string, unknown>>({});

    const handleFieldChange = React.useCallback((key: string, value: string) => {
        setValues(prev => {
            const next = { ...prev, [key]: value };
            onChange(next);
            return next;
        });
    }, [onChange]);

    const handleSlugChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        handleFieldChange('slug', e.target.value);
    }, [handleFieldChange]);

    const handleSkuChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        handleFieldChange('sku', e.target.value);
    }, [handleFieldChange]);

    const handleCodeChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        handleFieldChange('code', e.target.value);
    }, [handleFieldChange]);

    const handleNameChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        handleFieldChange('name', e.target.value);
    }, [handleFieldChange]);

    return (
        <div className="grid grid-cols-4 gap-2">
            <div>
                <label className="text-xs text-muted-foreground">slug</label>
                <Input value={String(values.slug ?? '')} onChange={handleSlugChange} />
            </div>
            <div>
                <label className="text-xs text-muted-foreground">sku</label>
                <Input value={String(values.sku ?? '')} onChange={handleSkuChange} />
            </div>
            <div>
                <label className="text-xs text-muted-foreground">code</label>
                <Input value={String(values.code ?? '')} onChange={handleCodeChange} />
            </div>
            <div>
                <label className="text-xs text-muted-foreground">name</label>
                <Input value={String(values.name ?? '')} onChange={handleNameChange} />
            </div>
        </div>
    );
}

function ErrorAuditList({ errorId }: { errorId: string }) {
    const { data: audits, isFetching } = useErrorAudits(errorId);

    if (!audits?.length) return null;

    return (
        <div className="mt-2 border rounded p-2">
            <div className="text-xs font-medium mb-1">Retry audit trail</div>
            <div className="space-y-2">
                {audits.map(a => (
                    <div key={a.id} className="text-xs">
                        <div className="text-muted-foreground">
                            {new Date(String(a.createdAt)).toLocaleString()} · user {a.userId ?? '—'}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <div className="font-medium">Previous</div>
                                <Json value={a.previousPayload} />
                            </div>
                            <div>
                                <div className="font-medium">Patch</div>
                                <Json value={a.patch} />
                            </div>
                            <div>
                                <div className="font-medium">Resulting</div>
                                <Json value={a.resultingPayload} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
