import * as React from 'react';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    PermissionGuard,
    Json,
    usePermissions,
} from '@vendure/dashboard';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ScrollText } from 'lucide-react';
import { formatDateTime } from '../../utils';
import { DATAHUB_PERMISSIONS, RUN_STATUS, ROUTES, TOAST_PIPELINE } from '../../constants';
import {
    usePipelineRun,
    useRunErrors,
    useRetryError,
    useApproveGate,
    useRejectGate,
    handleMutationError,
} from '../../hooks';
import { StepCounters } from './StepCounters';
import { StepSummaryTable } from './StepSummaryTable';
import { RunErrorsList } from './RunErrorsList';
import type {
    IndividualRunMetrics,
    StepMetricsDetail,
    RunDetailsPanelProps,
} from '../../types';

function findPausedGateStep(metrics: IndividualRunMetrics): string | undefined {
    const details = metrics.details;
    if (!Array.isArray(details)) return undefined;
    const gateStep = details.find(
        (d: StepMetricsDetail) => d.type === 'GATE' && (d as Record<string, unknown>).paused === true,
    );
    return gateStep?.stepKey;
}

export function RunDetailsPanel({ runId, initialData, onCancel, onRerun, isCancelling }: RunDetailsPanelProps) {
    const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);
    const { hasPermissions } = usePermissions();
    const canViewQuarantine = hasPermissions([DATAHUB_PERMISSIONS.VIEW_QUARANTINE]);
    const { data: runData, refetch, isFetching } = usePipelineRun(runId);
    const errorsQuery = useRunErrors(canViewQuarantine ? runId : undefined);
    const retryError = useRetryError();
    const approveGate = useApproveGate();
    const rejectGate = useRejectGate();
    const { mutateAsync: retryRunError } = retryError;
    const { mutateAsync: approveRunGate } = approveGate;
    const { mutateAsync: rejectRunGate } = rejectGate;

    const run = runData;
    const status = run?.status ?? initialData.status;
    const metrics: IndividualRunMetrics = (run?.metrics as IndividualRunMetrics) ?? initialData.metrics ?? {};
    const processed = Number(metrics.processed ?? 0);
    const succeeded = Number(metrics.succeeded ?? 0);
    const failed = Number(metrics.failed ?? 0);
    const skipped = Number(metrics.skipped ?? 0);
    const sourceRecords = Number(metrics.sourceRecords ?? 0);
    const summary = `${sourceRecords} source • ${processed} processed • ${succeeded} succeeded • ${skipped} skipped • ${failed} failed`;
    const errorPages = errorsQuery.data?.pages ?? [];
    const errors = errorPages.flatMap(page => page.items);
    const totalErrors = errorPages[0]?.totalItems ?? 0;

    const pausedGateStepKey = status === RUN_STATUS.PAUSED ? findPausedGateStep(metrics) : undefined;

    const handleRetry = React.useCallback(async (errorId: string, patch: Record<string, unknown>) => {
        try {
            const result = await retryRunError({ errorId, patch });
            if (!result.success) {
                toast.error(result.message, {
                    description: result.rejectedPatchKeys.length > 0
                        ? `Rejected fields: ${result.rejectedPatchKeys.join(', ')}`
                        : `Outcome: ${result.outcome}`,
                });
                return false;
            }
            toast.success(TOAST_PIPELINE.RECORD_RETRY_APPLIED, {
                description: result.auditRecorded ? `Audit ${String(result.auditId)}` : result.message,
            });
            return true;
        } catch (err) {
            handleMutationError('retry record', err);
            return false;
        }
    }, [retryRunError]);

    const handleCancel = React.useCallback(() => {
        setCancelDialogOpen(true);
    }, []);

    const handleConfirmCancel = React.useCallback(() => {
        onCancel(String(run?.id ?? runId));
        setCancelDialogOpen(false);
    }, [onCancel, run?.id, runId]);

    const handleRerun = React.useCallback(() => {
        const pipelineId = run?.pipeline?.id;
        if (pipelineId) {
            onRerun(String(pipelineId));
        }
    }, [onRerun, run?.pipeline?.id]);

    const handleApproveGate = React.useCallback(async () => {
        if (!pausedGateStepKey) return;
        try {
            const result = await approveRunGate({ runId: String(run?.id ?? runId), stepKey: pausedGateStepKey });
            if (result?.success) {
                toast.success(TOAST_PIPELINE.GATE_APPROVED);
            } else {
                toast.error(result?.message ?? TOAST_PIPELINE.GATE_APPROVE_ERROR);
            }
        } catch (err) {
            handleMutationError('approve gate', err);
        }
    }, [approveRunGate, run?.id, runId, pausedGateStepKey]);

    const handleRejectGate = React.useCallback(async () => {
        if (!pausedGateStepKey) return;
        try {
            const result = await rejectRunGate({ runId: String(run?.id ?? runId), stepKey: pausedGateStepKey });
            if (result?.success) {
                toast.success(TOAST_PIPELINE.GATE_REJECTED);
            } else {
                toast.error(result?.message ?? TOAST_PIPELINE.GATE_REJECT_ERROR);
            }
        } catch (err) {
            handleMutationError('reject gate', err);
        }
    }, [rejectRunGate, run?.id, runId, pausedGateStepKey]);

    return (
        <div className="p-4 space-y-4" data-testid="datahub-run-details-panel">
            <div className="flex items-center justify-between">
                <div className="text-sm">Status: {status}</div>
                <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="datahub-run-details-refresh-button">
                    Refresh
                </Button>
            </div>
            <div className="text-sm text-muted-foreground">{summary}</div>
            <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">Started by: {run?.startedByUserId ?? '—'}</div>
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                    <Link to={`${ROUTES.LOGS}?runId=${runId}`} aria-label="View logs for this run">
                        <ScrollText className="h-3.5 w-3.5" />
                        View Logs
                    </Link>
                </Button>
            </div>

            {status === RUN_STATUS.PAUSED && pausedGateStepKey && (
                <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2" data-testid="datahub-gate-approval-panel">
                    <div className="text-sm font-medium text-amber-800 dark:text-amber-400">
                        Gate step "{pausedGateStepKey}" is awaiting approval
                    </div>
                    <div className="flex gap-2">
                        <PermissionGuard requires={[DATAHUB_PERMISSIONS.RUN_PIPELINE]}>
                            <Button
                                variant="default"
                                size="sm"
                                onClick={handleApproveGate}
                                disabled={approveGate.isPending || rejectGate.isPending}
                                data-testid="datahub-gate-approve-button"
                            >
                                {approveGate.isPending ? 'Approving...' : 'Approve & Resume'}
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleRejectGate}
                                disabled={approveGate.isPending || rejectGate.isPending}
                                data-testid="datahub-gate-reject-button"
                            >
                                {rejectGate.isPending ? 'Rejecting...' : 'Reject & Cancel'}
                            </Button>
                        </PermissionGuard>
                    </div>
                </div>
            )}

            <StepCounters metrics={metrics} />
            <StepSummaryTable metrics={metrics} />

            <div>
                <div className="text-sm font-medium mb-1">Metrics</div>
                <Json value={run?.metrics ?? initialData.metrics ?? {}} />
            </div>
            <div className="text-sm">
                <div className="text-sm font-medium mb-1">Started</div>
                <div>{formatDateTime(run?.startedAt ?? initialData.startedAt)}</div>
            </div>
            <div className="text-sm">
                <div className="text-sm font-medium mb-1">Finished</div>
                <div>{(run?.finishedAt ?? initialData.finishedAt) ? formatDateTime(run?.finishedAt ?? initialData.finishedAt) : '—'}</div>
            </div>

            {run?.error && (
                <div className="text-sm">
                    <div className="text-sm font-medium mb-1">Error</div>
                    <pre className="bg-muted p-3 rounded text-xs overflow-auto">{String(run.error)}</pre>
                </div>
            )}

            {(status === RUN_STATUS.RUNNING || status === RUN_STATUS.PENDING) && (
                <PermissionGuard requires={[DATAHUB_PERMISSIONS.RUN_PIPELINE]}>
                    <Button variant="secondary" onClick={handleCancel} disabled={isCancelling} data-testid="datahub-run-details-cancel-button">
                        Cancel run
                    </Button>
                </PermissionGuard>
            )}

            {run?.pipeline?.id && (
                <PermissionGuard requires={[DATAHUB_PERMISSIONS.RUN_PIPELINE]}>
                    <Button variant="outline" onClick={handleRerun} data-testid="datahub-run-details-rerun-button">
                        Re-run
                    </Button>
                </PermissionGuard>
            )}

            <div className="mt-4">
                <div className="text-sm font-medium mb-1">Record errors</div>
                <div className="text-sm text-muted-foreground mb-2">Failed records captured during this run</div>
                <PermissionGuard requires={[DATAHUB_PERMISSIONS.VIEW_QUARANTINE]}>
                    <RunErrorsList
                        items={errors.map(error => ({
                            ...error,
                            id: String(error.id),
                        }))}
                        totalItems={totalErrors}
                        hasNextPage={errorsQuery.hasNextPage}
                        isFetchingNextPage={errorsQuery.isFetchingNextPage}
                        onLoadMore={() => void errorsQuery.fetchNextPage()}
                        onRetry={handleRetry}
                    />
                </PermissionGuard>
            </div>

            <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
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
                            onClick={() => setCancelDialogOpen(false)}
                        >
                            Keep Running
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirmCancel}
                            disabled={isCancelling}
                        >
                            {isCancelling ? 'Cancelling...' : 'Cancel Run'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
