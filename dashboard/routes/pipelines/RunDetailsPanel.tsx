import * as React from 'react';
import {
    Button,
    PermissionGuard,
    Json,
} from '@vendure/dashboard';
import { toast } from 'sonner';
import { formatDateTime } from '../../utils';
import { DATAHUB_PERMISSIONS, RUN_STATUS, TOAST_PIPELINE } from '../../constants';
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
    const { data: runData, refetch, isFetching } = usePipelineRun(runId);
    const { data: errors } = useRunErrors(runId);
    const retryError = useRetryError();
    const approveGate = useApproveGate();
    const rejectGate = useRejectGate();

    const run = runData;
    const status = run?.status ?? initialData.status;
    const metrics: IndividualRunMetrics = (run?.metrics as IndividualRunMetrics) ?? initialData.metrics ?? {};
    const processed = Number(metrics.processed ?? 0);
    const succeeded = Number(metrics.succeeded ?? 0);
    const failed = Number(metrics.failed ?? 0);
    const summary = `${processed} processed • ${succeeded} succeeded • ${failed} failed`;

    const pausedGateStepKey = status === RUN_STATUS.PAUSED ? findPausedGateStep(metrics) : undefined;

    const handleRetry = React.useCallback(async (errorId: string, patch: Record<string, unknown>) => {
        try {
            await retryError.mutateAsync({ errorId, patch });
            toast.success(TOAST_PIPELINE.RECORD_RETRY_QUEUED);
        } catch (err) {
            handleMutationError('retry record', err);
        }
    }, [retryError.mutateAsync]);

    const handleCancel = React.useCallback(() => {
        onCancel(run?.id ?? runId);
    }, [onCancel, run?.id, runId]);

    const handleRerun = React.useCallback(() => {
        const pipelineId = run?.pipeline?.id;
        if (pipelineId) {
            onRerun(String(pipelineId));
        }
    }, [onRerun, run]);

    const handleApproveGate = React.useCallback(async () => {
        if (!pausedGateStepKey) return;
        try {
            const result = await approveGate.mutateAsync({ runId: run?.id ?? runId, stepKey: pausedGateStepKey });
            if (result?.success) {
                toast.success(TOAST_PIPELINE.GATE_APPROVED);
            } else {
                toast.error(result?.message ?? TOAST_PIPELINE.GATE_APPROVE_ERROR);
            }
        } catch (err) {
            handleMutationError('approve gate', err);
        }
    }, [approveGate.mutateAsync, run?.id, runId, pausedGateStepKey]);

    const handleRejectGate = React.useCallback(async () => {
        if (!pausedGateStepKey) return;
        try {
            const result = await rejectGate.mutateAsync({ runId: run?.id ?? runId, stepKey: pausedGateStepKey });
            if (result?.success) {
                toast.success(TOAST_PIPELINE.GATE_REJECTED);
            } else {
                toast.error(result?.message ?? TOAST_PIPELINE.GATE_REJECT_ERROR);
            }
        } catch (err) {
            handleMutationError('reject gate', err);
        }
    }, [rejectGate.mutateAsync, run?.id, runId, pausedGateStepKey]);

    return (
        <div className="p-4 space-y-4" data-testid="datahub-run-details-panel">
            <div className="flex items-center justify-between">
                <div className="text-sm">Status: {status}</div>
                <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="datahub-run-details-refresh-button">
                    Refresh
                </Button>
            </div>
            <div className="text-sm text-muted-foreground">{summary}</div>
            <div className="text-xs text-muted-foreground">Started by: {run?.startedByUserId ?? '—'}</div>

            {status === RUN_STATUS.PAUSED && pausedGateStepKey && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2" data-testid="datahub-gate-approval-panel">
                    <div className="text-sm font-medium text-amber-800">
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
                <div>{formatDateTime(run?.finishedAt ?? initialData.finishedAt)}</div>
            </div>

            {run?.error && (
                <div className="text-sm">
                    <div className="text-sm font-medium mb-1">Error</div>
                    <pre className="bg-muted p-3 rounded text-xs overflow-auto">{String(run.error)}</pre>
                </div>
            )}

            {(status === RUN_STATUS.RUNNING || status === RUN_STATUS.PENDING) && (
                <Button variant="secondary" onClick={handleCancel} disabled={isCancelling} data-testid="datahub-run-details-cancel-button">
                    Cancel run
                </Button>
            )}

            {run?.pipeline?.id && (
                <Button variant="outline" onClick={handleRerun} data-testid="datahub-run-details-rerun-button">
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
