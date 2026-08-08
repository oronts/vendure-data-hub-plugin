import * as React from 'react';
import {
    Button,
    Badge,
    PermissionGuard,
    usePermissions,
} from '@vendure/dashboard';
import { Trans, useLingui } from '@lingui/react/macro';

import { toast } from 'sonner';
import {
    CheckCircle2,
    XCircle,
    Send,
    Archive,
    RotateCcw,
} from 'lucide-react';
import { getErrorMessage } from '../../../../shared';
import {
    PIPELINE_STATUS,
    DATAHUB_PERMISSIONS,
    PIPELINE_STATUS_TRANSLATION_IDS,
} from '../../../constants';
import type { PipelineStatus } from '../../../constants';
import {
    useSubmitPipelineForReview,
    useApprovePipeline,
    useRejectPipeline,
    usePublishPipeline,
    useArchivePipeline,
    useReactivatePipeline,
} from '../../../hooks';
import { getPipelineWorkflowPermission } from '../../../utils/pipeline-permissions';
import { getPipelineReviewActionVisibility } from '../../../utils/pipeline-review-actions';
import { BooleanStatusBadge } from '../../../components/shared';
import { ReviewActionDialogs } from './ReviewActionDialogs';

export interface ReviewActionsPanelProps {
    entityId?: string;
    status?: PipelineStatus;
    enabled?: boolean;
    currentRevisionId?: string | number | null;
    publishedVersionCount?: number;
    onStatusChange?: () => void;
    hasUnsavedChanges: boolean;
    managedByCodeFirst: boolean;
}

const STATUS_CONFIG: Record<string, {
    labelId: string;
    dotColor: string;
}> = {
    DRAFT: {
        labelId: PIPELINE_STATUS_TRANSLATION_IDS.DRAFT,
        dotColor: 'bg-slate-400',
    },
    REVIEW: {
        labelId: PIPELINE_STATUS_TRANSLATION_IDS.REVIEW,
        dotColor: 'bg-amber-500',
    },
    PUBLISHED: {
        labelId: PIPELINE_STATUS_TRANSLATION_IDS.PUBLISHED,
        dotColor: 'bg-emerald-500',
    },
    ARCHIVED: {
        labelId: PIPELINE_STATUS_TRANSLATION_IDS.ARCHIVED,
        dotColor: 'bg-slate-400',
    },
};

export function ReviewActionsPanel({
    entityId,
    status,
    enabled,
    currentRevisionId,
    publishedVersionCount,
    onStatusChange,
    hasUnsavedChanges,
    managedByCodeFirst,
}: Readonly<ReviewActionsPanelProps>) {
    const { i18n, t } = useLingui();
    const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false);
    const [approveDialogOpen, setApproveDialogOpen] = React.useState(false);
    const [publishDialogOpen, setPublishDialogOpen] = React.useState(false);
    const [submitDialogOpen, setSubmitDialogOpen] = React.useState(false);
    const [archiveDialogOpen, setArchiveDialogOpen] = React.useState(false);
    const [reactivateDialogOpen, setReactivateDialogOpen] = React.useState(false);
    const publishedVersion = publishedVersionCount ?? 0;

    const submitForReview = useSubmitPipelineForReview();
    const approve = useApprovePipeline();
    const reject = useRejectPipeline();
    const publish = usePublishPipeline();
    const archive = useArchivePipeline();
    const reactivate = useReactivatePipeline();

    const isSubmitting = submitForReview.isPending
        || approve.isPending
        || reject.isPending
        || publish.isPending
        || archive.isPending
        || reactivate.isPending;

    const statusConfig = STATUS_CONFIG[status ?? 'DRAFT'] ?? STATUS_CONFIG.DRAFT;
    const { hasPermissions } = usePermissions();
    const reviewActions = getPipelineReviewActionVisibility(
        hasPermissions([DATAHUB_PERMISSIONS.REVIEW_PIPELINE]),
        hasPermissions([DATAHUB_PERMISSIONS.PUBLISH_PIPELINE]),
    );
    const workflowPermission = getPipelineWorkflowPermission(status, {
        update: DATAHUB_PERMISSIONS.UPDATE_PIPELINE,
        review: DATAHUB_PERMISSIONS.REVIEW_PIPELINE,
        publish: DATAHUB_PERMISSIONS.PUBLISH_PIPELINE,
    });
    const actionDisabled = isSubmitting || hasUnsavedChanges;
    const statusDescription = (() => {
        switch (status) {
            case PIPELINE_STATUS.REVIEW: return t`Awaiting approval`;
            case PIPELINE_STATUS.PUBLISHED: return t`Active and ready to run`;
            case PIPELINE_STATUS.ARCHIVED: return t`Disabled and inactive`;
            default: return t`Not yet submitted for review`;
        }
    })();

    const createMutationHandler = React.useCallback(
        (
            mutateFn: (id: string, options: { onSuccess: () => void; onError: (err: unknown) => void }) => void,
            successMessage: string,
            errorMessage: string,
            closeDialog: React.Dispatch<React.SetStateAction<boolean>>,
            onAfterSuccess?: () => void,
        ) => () => {
            if (!entityId) return;
            mutateFn(entityId, {
                onSuccess: () => {
                    toast.success(successMessage);
                    closeDialog(false);
                    onAfterSuccess?.();
                    onStatusChange?.();
                },
                onError: (err) => {
                    toast.error(errorMessage, {
                        description: getErrorMessage(err),
                    });
                },
            });
        },
        [entityId, onStatusChange],
    );

    const handleSubmitForReview = React.useMemo(
        () => createMutationHandler(
            submitForReview.mutate,
            t`Submitted for review`,
            t`Submit failed`,
            setSubmitDialogOpen,
        ),
        [createMutationHandler, submitForReview.mutate, t],
    );

    const handleApprove = React.useMemo(
        () => createMutationHandler(
            approve.mutate,
            t`Approved`,
            t`Approve failed`,
            setApproveDialogOpen,
        ),
        [createMutationHandler, approve.mutate, t],
    );

    const handleReject = React.useMemo(
        () => createMutationHandler(
            reject.mutate,
            t`Rejected`,
            t`Reject failed`,
            setRejectDialogOpen,
        ),
        [createMutationHandler, reject.mutate, t],
    );

    const handlePublish = React.useMemo(
        () => createMutationHandler(
            publish.mutate,
            t`Published`,
            t`Publish failed`,
            setPublishDialogOpen,
        ),
        [createMutationHandler, publish.mutate, t],
    );

    const handleArchive = React.useMemo(
        () => createMutationHandler(
            archive.mutate,
            t`Pipeline archived`,
            t`Failed to archive pipeline`,
            setArchiveDialogOpen,
        ),
        [createMutationHandler, archive.mutate, t],
    );

    const handleReactivate = React.useMemo(
        () => createMutationHandler(
            reactivate.mutate,
            t`Pipeline reactivated`,
            t`Failed to reactivate pipeline`,
            setReactivateDialogOpen,
        ),
        [createMutationHandler, reactivate.mutate, t],
    );

    if (!entityId) return null;

    return (
        <>
            <div className="flex flex-col items-start justify-between gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <div
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusConfig.dotColor}`}
                        aria-hidden="true"
                    />
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-sm">
                            {i18n._(statusConfig.labelId)}
                        </span>
                        <span className="text-muted-foreground text-sm">
                            {statusDescription}
                        </span>
                    </div>
                </div>

                <div className="flex max-w-full flex-wrap items-center gap-2">
                    {status === PIPELINE_STATUS.DRAFT && workflowPermission && (
                        <PermissionGuard requires={[workflowPermission]}>
                            <Button
                                variant="default"
                                size="sm"
                                onClick={() => setSubmitDialogOpen(true)}
                                disabled={actionDisabled}
                                title={hasUnsavedChanges
                                    ? t`Save changes before submitting for review`
                                    : undefined}
                                aria-label={t`Submit for review`}
                                data-testid="datahub-review-submit-btn"
                            >
                                <Send className="mr-1.5 h-3.5 w-3.5" />
                                <Trans>Submit for review</Trans>
                            </Button>
                        </PermissionGuard>
                    )}

                    {status === PIPELINE_STATUS.REVIEW && (
                        <div className="flex flex-wrap items-center gap-2">
                            {reviewActions.reject && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setRejectDialogOpen(true)}
                                    disabled={actionDisabled}
                                    title={hasUnsavedChanges
                                        ? t`Save changes before reviewing`
                                        : undefined}
                                    aria-label={t`Reject`}
                                    data-testid="datahub-review-reject-btn"
                                >
                                    <XCircle className="mr-1.5 h-3.5 w-3.5" />
                                    <Trans>Reject</Trans>
                                </Button>
                            )}
                            {reviewActions.approve && (
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => setApproveDialogOpen(true)}
                                    disabled={actionDisabled}
                                    title={hasUnsavedChanges
                                        ? t`Save changes before reviewing`
                                        : undefined}
                                    aria-label={t`Approve`}
                                    data-testid="datahub-review-approve-btn"
                                >
                                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                    <Trans>Approve</Trans>
                                </Button>
                            )}
                            {reviewActions.publish && (
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => setPublishDialogOpen(true)}
                                    disabled={actionDisabled}
                                    title={hasUnsavedChanges
                                        ? t`Save changes before publishing`
                                        : undefined}
                                    aria-label={t`Publish`}
                                    data-testid="datahub-review-publish-btn"
                                >
                                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                    <Trans>Publish</Trans>
                                </Button>
                            )}
                        </div>
                    )}

                    {status === PIPELINE_STATUS.PUBLISHED && workflowPermission && (
                        <PermissionGuard requires={[workflowPermission]}>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setArchiveDialogOpen(true)}
                                disabled={actionDisabled || managedByCodeFirst}
                                title={hasUnsavedChanges
                                    ? t`Save changes before archiving`
                                    : undefined}
                                aria-label={t`Archive`}
                                data-testid="datahub-review-archive-btn"
                            >
                                <Archive className="mr-1.5 h-3.5 w-3.5" />
                                <Trans>Archive</Trans>
                            </Button>
                        </PermissionGuard>
                    )}

                    {status === PIPELINE_STATUS.ARCHIVED && (
                        <PermissionGuard requires={[DATAHUB_PERMISSIONS.PUBLISH_PIPELINE]}>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setReactivateDialogOpen(true)}
                                disabled={actionDisabled || managedByCodeFirst}
                                aria-label={t`Reactivate`}
                                data-testid="datahub-review-reactivate-btn"
                            >
                                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                                <Trans>Reactivate</Trans>
                            </Button>
                        </PermissionGuard>
                    )}

                    {currentRevisionId != null && (
                        <Badge variant="secondary">
                            {status === PIPELINE_STATUS.ARCHIVED
                                ? <Trans>Last published v{publishedVersion}</Trans>
                                : <Trans>Published v{publishedVersion}</Trans>}
                        </Badge>
                    )}

                    {currentRevisionId != null && status !== PIPELINE_STATUS.ARCHIVED && (
                        <BooleanStatusBadge enabled={enabled !== false} />
                    )}

                </div>
            </div>

            <ReviewActionDialogs
                submitOpen={submitDialogOpen}
                setSubmitOpen={setSubmitDialogOpen}
                approveOpen={approveDialogOpen}
                setApproveOpen={setApproveDialogOpen}
                publishOpen={publishDialogOpen}
                setPublishOpen={setPublishDialogOpen}
                rejectOpen={rejectDialogOpen}
                setRejectOpen={setRejectDialogOpen}
                archiveOpen={archiveDialogOpen}
                setArchiveOpen={setArchiveDialogOpen}
                reactivateOpen={reactivateDialogOpen}
                setReactivateOpen={setReactivateDialogOpen}
                onSubmit={handleSubmitForReview}
                onApprove={handleApprove}
                onPublish={handlePublish}
                onReject={handleReject}
                onArchive={handleArchive}
                onReactivate={handleReactivate}
                pending={isSubmitting}
                actionDisabled={actionDisabled}
                codeFirstManaged={managedByCodeFirst}
            />
        </>
    );
}
