import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';

import {
    Button,
    Dialog,
    buttonVariants,
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
import {
    DATAHUB_PERMISSIONS,
    RUN_STATUS,
    RUN_STATUS_TRANSLATION_IDS,
    ROUTES,
} from '../../constants';
import {
    usePipelineRun,
    useRunErrors,
    useRetryError,
    useApproveGate,
    useRejectGate,
} from '../../hooks';
import { StepCounters } from './StepCounters';
import { StepSummaryTable } from './StepSummaryTable';
import { RunErrorsList } from './RunErrorsList';
import { ErrorState, LoadingState } from '../../components/shared';
import { getErrorMessage } from '../../../shared';
import type { IndividualRunMetrics, RunDetailsPanelProps } from '../../types';
import { buildRunSummaryMessages, findPausedGateStep } from './run-details-format';

export function RunDetailsPanel({
    runId,
    initialData,
    onCancel,
    onRerun,
    canRerun,
    isCancelling,
}: RunDetailsPanelProps) {
    const { i18n, t } = useLingui();
    const locale = i18n.locale;
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
    const summary = buildRunSummaryMessages(metrics)
        .map(message => {
            const { count } = message;
            switch (message.kind) {
                case 'SOURCE': return count === 1 ? t`${count} source record` : t`${count} source records`;
                case 'PROCESSED': return t`${count} processed`;
                case 'SUCCEEDED': return t`${count} succeeded`;
                case 'SKIPPED': return t`${count} skipped`;
                case 'FAILED': return t`${count} failed`;
            }
        })
        .join(' • ');
    const errorPages = errorsQuery.data?.pages ?? [];
    const errors = errorPages.flatMap(page => page.items);
    const totalErrors = errorPages[0]?.totalItems ?? 0;

    const pausedGateStepKey = status === RUN_STATUS.PAUSED
        ? run?.gateStepKey ?? findPausedGateStep(metrics)
        : undefined;

    const handleRetry = React.useCallback(async (errorId: string, patch: Record<string, unknown>) => {
        try {
            const result = await retryRunError({ errorId, patch });
            if (!result.success) {
                toast.error(t`Failed to retry record`, {
                    description: result.rejectedPatchKeys.length > 0
                        ? t`Rejected fields: ${result.rejectedPatchKeys.join(', ')}`
                        : t`Outcome: ${result.outcome}`,
                });
                return false;
            }
            toast.success(t`Record retry applied`, {
                description: result.auditRecorded
                    ? t`Audit ${String(result.auditId)}`
                    : result.message,
            });
            return true;
        } catch {
            return false;
        }
    }, [retryRunError, t]);

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
            onRerun(
                String(pipelineId),
                run.pipeline.currentRevisionId,
            );
        }
    }, [onRerun, run?.pipeline]);

    const handleApproveGate = React.useCallback(async () => {
        if (!pausedGateStepKey) return;
        try {
            const result = await approveRunGate({ runId: String(run?.id ?? runId), stepKey: pausedGateStepKey });
            if (result?.success) {
                toast.success(t`Gate approved`);
            } else {
                toast.error(t`Failed to approve gate`, {
                    description: result?.message,
                });
            }
        } catch {
            return;
        }
    }, [approveRunGate, pausedGateStepKey, run?.id, runId, t]);

    const handleRejectGate = React.useCallback(async () => {
        if (!pausedGateStepKey) return;
        try {
            const result = await rejectRunGate({ runId: String(run?.id ?? runId), stepKey: pausedGateStepKey });
            if (result?.success) {
                toast.success(t`Gate rejected`);
            } else {
                toast.error(t`Failed to reject gate`, {
                    description: result?.message,
                });
            }
        } catch {
            return;
        }
    }, [pausedGateStepKey, rejectRunGate, run?.id, runId, t]);

    const statusId = RUN_STATUS_TRANSLATION_IDS[
        status as keyof typeof RUN_STATUS_TRANSLATION_IDS
    ];
    const statusLabel = statusId ? i18n._(statusId) : status;

    return (
        <div className="p-4 space-y-4" data-testid="datahub-run-details-panel">
            <div className="flex items-center justify-between">
                <div className="text-sm">
                    <Trans>Status:</Trans> {statusLabel}
                </div>
                <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="datahub-run-details-refresh-button">
                    <Trans>Refresh</Trans>
                </Button>
            </div>
            <div className="text-sm text-muted-foreground">{summary}</div>
            <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                    <Trans>Started by: {run?.startedByUserId ?? '—'}</Trans>
                </div>
                <Link
                    className={buttonVariants({ variant: 'outline', size: 'sm', className: 'gap-1.5' })}
                    to={ROUTES.LOGS}
                    search={{ runId: String(runId) }}
                    aria-label={t`View logs for this run`}
                >
                    <ScrollText className="h-3.5 w-3.5" />
                    <Trans>View logs</Trans>
                </Link>
            </div>

            {status === RUN_STATUS.PAUSED && pausedGateStepKey && (
                <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2" data-testid="datahub-gate-approval-panel">
                    <div className="text-sm font-medium text-amber-800 dark:text-amber-400">
                        <Trans>Gate step {pausedGateStepKey} is awaiting approval</Trans>
                    </div>
                    {run?.gateTimeoutAt && (
                        <div className="text-xs text-amber-700 dark:text-amber-300">
                            <Trans>
                                Auto-approval is scheduled for{' '}
                                {formatDateTime(run.gateTimeoutAt, undefined, locale)}.
                                The server processes it on the next maintenance cycle.
                            </Trans>
                        </div>
                    )}
                    <div className="flex gap-2">
                        <PermissionGuard requires={[DATAHUB_PERMISSIONS.RUN_PIPELINE]}>
                            <Button
                                variant="default"
                                size="sm"
                                onClick={handleApproveGate}
                                disabled={approveGate.isPending || rejectGate.isPending}
                                data-testid="datahub-gate-approve-button"
                            >
                                {approveGate.isPending
                                    ? <Trans>Approving...</Trans>
                                    : <Trans>Approve &amp; resume</Trans>}
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleRejectGate}
                                disabled={approveGate.isPending || rejectGate.isPending}
                                data-testid="datahub-gate-reject-button"
                            >
                                {rejectGate.isPending
                                    ? <Trans>Rejecting...</Trans>
                                    : <Trans>Reject &amp; cancel</Trans>}
                            </Button>
                        </PermissionGuard>
                    </div>
                </div>
            )}

            <StepCounters metrics={metrics} />
            <StepSummaryTable metrics={metrics} />

            <div>
                <div className="text-sm font-medium mb-1">
                    <Trans>Metrics</Trans>
                </div>
                <Json value={run?.metrics ?? initialData.metrics ?? {}} />
            </div>
            <div className="text-sm">
                <div className="text-sm font-medium mb-1">
                    <Trans>Started</Trans>
                </div>
                <div>{formatDateTime(run?.startedAt ?? initialData.startedAt, undefined, locale)}</div>
            </div>
            <div className="text-sm">
                <div className="text-sm font-medium mb-1">
                    <Trans>Finished</Trans>
                </div>
                <div>{(run?.finishedAt ?? initialData.finishedAt)
                    ? formatDateTime(run?.finishedAt ?? initialData.finishedAt, undefined, locale)
                    : '—'}</div>
            </div>

            {run?.error && (
                <div className="text-sm">
                    <div className="text-sm font-medium mb-1">
                        <Trans>Error</Trans>
                    </div>
                    <pre className="bg-muted p-3 rounded text-xs overflow-auto">{String(run.error)}</pre>
                </div>
            )}

            {(status === RUN_STATUS.RUNNING || status === RUN_STATUS.PENDING) && (
                <PermissionGuard requires={[DATAHUB_PERMISSIONS.RUN_PIPELINE]}>
                    <Button variant="secondary" onClick={handleCancel} disabled={isCancelling} data-testid="datahub-run-details-cancel-button">
                        <Trans>Cancel run</Trans>
                    </Button>
                </PermissionGuard>
            )}

            {run?.pipeline?.id && canRerun && (
                <PermissionGuard requires={[DATAHUB_PERMISSIONS.RUN_PIPELINE]}>
                    <Button variant="outline" onClick={handleRerun} data-testid="datahub-run-details-rerun-button">
                        <Trans>Re-run</Trans>
                    </Button>
                </PermissionGuard>
            )}

            <div className="mt-4">
                <div className="text-sm font-medium mb-1">
                    <Trans>Record errors</Trans>
                </div>
                <div className="text-sm text-muted-foreground mb-2">
                    <Trans>Failed records captured during this run</Trans>
                </div>
                <PermissionGuard requires={[DATAHUB_PERMISSIONS.VIEW_QUARANTINE]}>
                    {errorsQuery.isLoading ? (
                        <LoadingState
                            type="table"
                            rows={3}
                            message={t`Loading record errors...`}
                        />
                    ) : errorsQuery.isError ? (
                        <ErrorState
                            title={t`Failed to load record errors`}
                            message={getErrorMessage(errorsQuery.error)}
                            onRetry={() => void errorsQuery.refetch()}
                        />
                    ) : (
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
                    )}
                </PermissionGuard>
            </div>

            <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            <Trans>Cancel pipeline run</Trans>
                        </DialogTitle>
                        <DialogDescription>
                            <Trans>This will request cancellation of the running pipeline. This action cannot be undone.</Trans>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setCancelDialogOpen(false)}
                        >
                            <Trans>Keep running</Trans>
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirmCancel}
                            disabled={isCancelling}
                        >
                            {isCancelling
                                ? <Trans>Cancelling...</Trans>
                                : <Trans>Cancel run</Trans>}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
