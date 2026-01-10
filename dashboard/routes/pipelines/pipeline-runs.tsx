import { Button, DataTable, PageBlock, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, PermissionGuard, Input } from '@vendure/dashboard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef, SortingState } from '@tanstack/react-table';
import * as React from 'react';
import { graphql } from '@/gql';
import { api } from '@vendure/dashboard';
import { Json } from '@vendure/dashboard';
import { POLLING_INTERVALS } from '../../constants';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/** Run metrics structure from GraphQL */
interface RunMetrics {
    processed?: number;
    succeeded?: number;
    failed?: number;
    durationMs?: number;
    details?: StepMetricsDetail[];
    [key: string]: unknown;
}

/** Step-level metrics detail */
interface StepMetricsDetail {
    stepKey?: string;
    type?: string;
    adapterCode?: string;
    /** Number of successfully processed records (canonical field name) */
    ok?: number;
    fail?: number;
    durationMs?: number;
    counters?: Record<string, number>;
    [key: string]: unknown;
}

const pipelineRunsDocument = graphql(`
    query DataHubPipelineRuns($pipelineId: ID, $options: DataHubPipelineListOptions) {
        dataHubPipelineRuns(pipelineId: $pipelineId, options: $options) {
            items {
                id
                status
                startedAt
                finishedAt
                metrics
            }
            totalItems
        }
    }
`);

const cancelRunDocument = graphql(`
    mutation CancelDataHubPipelineRun($id: ID!) {
        cancelDataHubPipelineRun(id: $id) {
            id
            status
        }
    }
`);

export function PipelineRunsBlock({ pipelineId }: { pipelineId?: string }) {
    const queryClient = useQueryClient();
    const [page, setPage] = React.useState(1);
    const [itemsPerPage, setItemsPerPage] = React.useState(10);
    const [sorting, setSorting] = React.useState<SortingState>([
        { id: 'startedAt', desc: true },
    ]);
    const [status, setStatus] = React.useState<string>('');

    const sortVar = sorting.length
        ? { [sorting[0].id]: sorting[0].desc ? 'DESC' : 'ASC' }
        : undefined;

    // Note: GraphQL types for sort/filter may be looser than TypeScript expects
    // These casts are necessary for compatibility with the generated GraphQL types
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['DataHubPipelineRuns', pipelineId, page, itemsPerPage, sortVar, status],
        queryFn: () =>
            api.query(pipelineRunsDocument, {
                pipelineId,
                options: {
                    take: itemsPerPage,
                    skip: (page - 1) * itemsPerPage,
                    sort: sortVar as Record<string, 'ASC' | 'DESC'> | undefined,
                    filter: status ? { status: { eq: status } } : undefined,
                },
            }),
        enabled: !!pipelineId,
        refetchInterval: POLLING_INTERVALS.PIPELINE_RUNS,
    });

    const cancelRunMutation = useMutation({
        mutationFn: (vars: { id: string }) => api.mutate(cancelRunDocument, vars),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['DataHubPipelineRuns', pipelineId] });
        },
    });

    type RunRow = {
        id: string;
        status: string;
        startedAt?: string | null;
        finishedAt?: string | null;
        metrics?: RunMetrics;
    };

    const runs: RunRow[] = data?.dataHubPipelineRuns.items ?? [];
    const totalItems = data?.dataHubPipelineRuns.totalItems ?? 0;

    const [selectedRun, setSelectedRun] = React.useState<RunRow | null>(null);

    const runDetailsDocument = graphql(`
        query DataHubPipelineRunDetail($id: ID!) {
            dataHubPipelineRun(id: $id) {
                id
                status
                startedAt
                finishedAt
                metrics
                error
                pipeline { id }
                startedByUserId
            }
        }
    `);

    const runDetails = useQuery({
        queryKey: ['DataHubPipelineRunDetail', selectedRun?.id],
        queryFn: () => api.query(runDetailsDocument, { id: selectedRun?.id! }),
        enabled: !!selectedRun?.id,
        refetchInterval: selectedRun ? POLLING_INTERVALS.PIPELINE_RUN_DETAILS : false,
    });

    const runErrorsDocument = graphql(`
        query DataHubRunErrors($runId: ID!) {
            dataHubRunErrors(runId: $runId) {
                id
                stepKey
                message
                payload
            }
        }
    `);

    const runErrorAuditsDocument = graphql(`
        query DataHubRecordRetryAudits($errorId: ID!) {
            dataHubRecordRetryAudits(errorId: $errorId) {
                id
                createdAt
                userId
                previousPayload
                patch
                resultingPayload
            }
        }
    `);

    const runErrors = useQuery({
        queryKey: ['DataHubRunErrors', selectedRun?.id],
        queryFn: () => api.query(runErrorsDocument, { runId: selectedRun?.id! }),
        enabled: !!selectedRun?.id,
        refetchInterval: selectedRun ? POLLING_INTERVALS.RUN_ERRORS : false,
    });

    const retryRecordDocument = graphql(`
        mutation RetryDataHubRecord($errorId: ID!, $patch: JSON) {
            retryDataHubRecord(errorId: $errorId, patch: $patch)
        }
    `);

    const columns: ColumnDef<RunRow, unknown>[] = [
        {
            id: 'id',
            header: 'ID',
            accessorFn: row => row.id,
            cell: ({ row }) => (
                <button
                    className="font-mono text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setSelectedRun(row.original)}
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
            cell: ({ row }) => formatDate(row.original.startedAt),
        },
        {
            id: 'finishedAt',
            header: 'Finished',
            accessorFn: row => row.finishedAt ?? '',
            cell: ({ row }) => formatDate(row.original.finishedAt),
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
                const canCancel = st === 'RUNNING' || st === 'PENDING';
                return canCancel ? (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => cancelRunMutation.mutate({ id: row.original.id })}
                        disabled={cancelRunMutation.isPending}
                    >
                        Cancel
                    </Button>
                ) : (
                    <span className="text-muted-foreground">—</span>
                );
            },
            enableSorting: false,
        },
    ];

    return (
        <>
        <PageBlock column="main" blockId="runs">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-semibold">Runs</h3>
                <div className="flex items-center gap-2">
                    <Select value={status || '__all__'} onValueChange={v => { setPage(1); setStatus(v === '__all__' ? '' : v); }}>
                        <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="All statuses" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">All</SelectItem>
                            <SelectItem value="PENDING">Pending</SelectItem>
                            <SelectItem value="RUNNING">Running</SelectItem>
                            <SelectItem value="COMPLETED">Completed</SelectItem>
                            <SelectItem value="FAILED">Failed</SelectItem>
                            <SelectItem value="CANCEL_REQUESTED">Cancel requested</SelectItem>
                            <SelectItem value="CANCELLED">Cancelled</SelectItem>
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
                onPageChange={p => setPage(p)}
                onSortChange={setSorting}
                onRefresh={refetch}
                disableViewOptions
            />
        </PageBlock>
        <Drawer open={!!selectedRun} onOpenChange={open => !open && setSelectedRun(null)}>
            <DrawerContent>
                <DrawerHeader>
                    <DrawerTitle>Run details</DrawerTitle>
                    <DrawerDescription>
                        {selectedRun ? `Run ${selectedRun.id}` : 'Details'}
                    </DrawerDescription>
                </DrawerHeader>
                {selectedRun ? (
                    <div className="p-4 space-y-4">
                        {(() => {
                            const d = runDetails.data?.dataHubPipelineRun;
                            const status = d?.status ?? selectedRun.status;
                            const metrics: RunMetrics = (d?.metrics as RunMetrics) ?? selectedRun.metrics ?? {};
                            const processed = Number(metrics.processed ?? 0);
                            const succeeded = Number(metrics.succeeded ?? 0);
                            const failed = Number(metrics.failed ?? 0);
                            const summary = `${processed} processed • ${succeeded} succeeded • ${failed} failed`;
                            return (
                                <>
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm">Status: {status}</div>
                                        <div>
                                            <Button variant="ghost" size="sm" onClick={() => runDetails.refetch()} disabled={runDetails.isFetching}>
                                                Refresh
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="text-sm text-muted-foreground">{summary}</div>
                                    <div className="text-xs text-muted-foreground">Started by: {d?.startedByUserId ?? '—'}</div>
                                    {(() => {
                                        const metricsTyped = d?.metrics as RunMetrics | undefined;
                                        const detailsArr: StepMetricsDetail[] = Array.isArray(metricsTyped?.details)
                                            ? metricsTyped.details
                                            : [];
                                        const countersObj = detailsArr.find(x => x && typeof x === 'object' && x.counters);
                                        if (!countersObj?.counters) return null;
                                        const c = countersObj.counters;
                                        return (
                                            <div className="mt-2">
                                                <div className="text-sm font-medium mb-1">Counters</div>
                                                <table className="text-sm">
                                                    <tbody>
                                                        {Object.entries(c).map(([k, v]) => (
                                                            <tr key={k}>
                                                                <td className="pr-3 text-muted-foreground">{k}</td>
                                                                <td>{String(v)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        );
                                    })()}
                                    {(() => {
                                        const metricsTyped = d?.metrics as RunMetrics | undefined;
                                        const details: StepMetricsDetail[] = Array.isArray(metricsTyped?.details)
                                            ? metricsTyped.details
                                            : [];
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
                                                        {details.map((s, i) => (
                                                            <tr key={i} className="border-t">
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
                                    })()}
                                    <div>
                                        <div className="text-sm font-medium mb-1">Metrics</div>
                                        <Json value={d?.metrics ?? selectedRun.metrics ?? {}} />
                                    </div>
                                    <div className="text-sm">
                                        <div className="text-sm font-medium mb-1">Started</div>
                                        <div>{formatDate(d?.startedAt ?? selectedRun.startedAt)}</div>
                                    </div>
                                    <div className="text-sm">
                                        <div className="text-sm font-medium mb-1">Finished</div>
                                        <div>{formatDate(d?.finishedAt ?? selectedRun.finishedAt)}</div>
                                    </div>
                                    {d?.error ? (
                                        <div className="text-sm">
                                            <div className="text-sm font-medium mb-1">Error</div>
                                            <pre className="bg-muted p-3 rounded text-xs overflow-auto">{String(d.error)}</pre>
                                        </div>
                                    ) : null}
                                    {(status === 'RUNNING' || status === 'PENDING') && (
                                        <div>
                                            <Button
                                                variant="secondary"
                                                onClick={() => {
                                                    const id = d?.id ?? selectedRun.id;
                                                    cancelRunMutation.mutate({ id });
                                                }}
                                                disabled={cancelRunMutation.isPending}
                                            >
                                                Cancel run
                                            </Button>
                                        </div>
                                    )}
                                    {d?.pipeline?.id && (
                                        <div>
                                            <Button
                                                variant="outline"
                                                onClick={async () => {
                                                    try {
                                                        await api.mutate(graphql(`
                                                            mutation ReRun($pipelineId: ID!) {
                                                                startDataHubPipelineRun(pipelineId: $pipelineId) { id status }
                                                            }
                                                        `), { pipelineId: d.pipeline.id });
                                                    } catch {}
                                                }}
                                            >
                                                Re-run
                                            </Button>
                                        </div>
                                    )}
                                    <div className="mt-4">
                                        <div className="text-sm font-medium mb-1">Record errors</div>
                                        <div className="text-sm text-muted-foreground mb-2">Failed records captured during this run</div>
                                        <PermissionGuard requires={['ViewQuarantine']}>
                                            <RunErrorsList
                                                runId={selectedRun.id}
                                                items={runErrors.data?.dataHubRunErrors ?? []}
                                                onRetry={async (errorId, patch) => {
                                                    try {
                                                        await api.mutate(retryRecordDocument, { errorId, patch });
                                                        await runErrors.refetch();
                                                    } catch {}
                                                }}
                                            />
                                        </PermissionGuard>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                ) : null}
            </DrawerContent>
        </Drawer>
        </>
    );
}

function RunErrorsList({ runId, items, onRetry }: Readonly<{ runId: string; items: Array<{ id: string; stepKey: string; message: string; payload: unknown }>; onRetry: (errorId: string, patch: unknown) => Promise<void> }>) {
    const [editing, setEditing] = React.useState<{ id: string; patch: string } | null>(null);
    return (
        <div className="space-y-2">
            {items.length === 0 ? (
                <div className="text-sm text-muted-foreground">No record errors</div>
            ) : (
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
                            <React.Fragment key={item.id}>
                                <tr className="border-t align-top">
                                    <td className="px-2 py-1 font-mono text-muted-foreground">{item.stepKey}</td>
                                    <td className="px-2 py-1">{item.message}</td>
                                    <td className="px-2 py-1 align-top">
                                        <Json value={item.payload} />
                                        <ErrorAuditList errorId={item.id} />
                                    </td>
                                    <td className="px-2 py-1 align-top">
                                    <PermissionGuard requires={['ReplayRecord']}>
                                        <Button variant="outline" size="sm" onClick={() => setEditing({ id: item.id, patch: '{}' })}>Retry with patch</Button>
                                    </PermissionGuard>
                                    </td>
                                </tr>
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            )}
            {editing && (
                <div className="border rounded p-2 space-y-2">
                    <div className="text-sm font-medium">Patch JSON</div>
                    <textarea className="w-full h-32 font-mono p-2 border rounded" value={editing.patch} onChange={e => setEditing({ ...editing, patch: e.target.value })} />
                    <RetryPatchHelper errorId={editing.id} onChange={p => setEditing({ ...editing, patch: JSON.stringify(p, null, 2) })} />
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            onClick={async () => {
                                try {
                                    const patch = JSON.parse(editing.patch);
                                    await onRetry(editing.id, patch);
                                    setEditing(null);
                                } catch {
                                    // ignore parse error
                                }
                            }}
                        >
                            Retry
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                </div>
            )}
        </div>
    );
}

function RetryPatchHelper({ errorId, onChange }: Readonly<{ errorId: string; onChange: (p: any) => void }>) {
    // Best-effort helper: provide common fields for loaders
    const [values, setValues] = React.useState<Record<string, any>>({});
    function set(k: string, v: any) {
        const next = { ...values, [k]: v };
        setValues(next);
        onChange(next);
    }
    return (
        <div className="grid grid-cols-4 gap-2">
            <div>
                <label className="text-xs text-muted-foreground">slug</label>
                <Input value={values.slug ?? ''} onChange={e => set('slug', e.target.value)} />
            </div>
            <div>
                <label className="text-xs text-muted-foreground">sku</label>
                <Input value={values.sku ?? ''} onChange={e => set('sku', e.target.value)} />
            </div>
            <div>
                <label className="text-xs text-muted-foreground">code</label>
                <Input value={values.code ?? ''} onChange={e => set('code', e.target.value)} />
            </div>
            <div>
                <label className="text-xs text-muted-foreground">name</label>
                <Input value={values.name ?? ''} onChange={e => set('name', e.target.value)} />
            </div>
        </div>
    );
}

function ErrorAuditList({ errorId }: Readonly<{ errorId: string }>) {
    const { data, isFetching } = useQuery({
        queryKey: ['DataHubRecordRetryAudits', errorId],
        queryFn: () => api.query(runErrorAuditsDocument, { errorId }),
        enabled: !!errorId,
        refetchInterval: POLLING_INTERVALS.ERROR_AUDITS,
    });
    const rows = data?.dataHubRecordRetryAudits ?? [];
    if (rows.length === 0) return null;
    return (
        <div className="mt-2 border rounded p-2">
            <div className="text-xs font-medium mb-1">Retry audit trail</div>
            <div className="space-y-2">
                {rows.map(a => (
                    <div key={a.id} className="text-xs">
                        <div className="text-muted-foreground">{new Date(String(a.createdAt)).toLocaleString()} · user {a.userId ?? '—'}</div>
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

function formatDate(value?: string | null) {
    if (!value) return '—';
    try {
        const d = new Date(value);
        return d.toLocaleString();
    } catch {
        return String(value);
    }
}
