import * as React from 'react';
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Textarea,
} from '@vendure/dashboard';
import { toast } from 'sonner';
import {
    CheckCircle2,
    XCircle,
    Send,
    Clock,
    FileCheck,
    AlertCircle,
    MessageSquare,
    Archive,
    Play,
} from 'lucide-react';
import { getErrorMessage } from '../../../../shared';
import {
    PIPELINE_STATUS,
    TOAST_PIPELINE,
} from '../../../constants';
import type { PipelineStatus } from '../../../constants';
import {
    useSubmitPipelineForReview,
    useApprovePipeline,
    useRejectPipeline,
    useArchivePipeline,
} from '../../../hooks';

export interface ReviewActionsPanelProps {
    entityId?: string;
    status?: PipelineStatus;
    onStatusChange?: () => void;
}

const STATUS_CONFIG: Record<string, {
    label: string;
    description: string;
    icon: React.ElementType;
    dotColor: string;
}> = {
    DRAFT: {
        label: 'Draft',
        description: 'Not yet submitted for review',
        icon: Clock,
        dotColor: 'bg-slate-400',
    },
    REVIEW: {
        label: 'In Review',
        description: 'Awaiting approval',
        icon: FileCheck,
        dotColor: 'bg-amber-500',
    },
    PUBLISHED: {
        label: 'Published',
        description: 'Active and ready to run',
        icon: CheckCircle2,
        dotColor: 'bg-emerald-500',
    },
    ARCHIVED: {
        label: 'Archived',
        description: 'Disabled and inactive',
        icon: AlertCircle,
        dotColor: 'bg-slate-400',
    },
};

export function ReviewActionsPanel({
    entityId,
    status,
    onStatusChange,
}: Readonly<ReviewActionsPanelProps>) {
    const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false);
    const [approveDialogOpen, setApproveDialogOpen] = React.useState(false);
    const [submitDialogOpen, setSubmitDialogOpen] = React.useState(false);
    const [archiveDialogOpen, setArchiveDialogOpen] = React.useState(false);
    const [rejectReason, setRejectReason] = React.useState('');

    const submitForReview = useSubmitPipelineForReview();
    const approve = useApprovePipeline();
    const reject = useRejectPipeline();
    const archive = useArchivePipeline();

    const isSubmitting = submitForReview.isPending || approve.isPending || reject.isPending || archive.isPending;

    const statusConfig = STATUS_CONFIG[status ?? 'DRAFT'] ?? STATUS_CONFIG.DRAFT;

    const handleSubmitForReview = React.useCallback(() => {
        if (!entityId) return;
        submitForReview.mutate(entityId, {
            onSuccess: () => {
                toast.success(TOAST_PIPELINE.SUBMITTED_FOR_REVIEW);
                setSubmitDialogOpen(false);
                onStatusChange?.();
            },
            onError: (err) => {
                toast.error(TOAST_PIPELINE.SUBMIT_ERROR, {
                    description: getErrorMessage(err),
                });
            },
        });
    }, [entityId, onStatusChange, submitForReview.mutate]);

    const handleApprove = React.useCallback(() => {
        if (!entityId) return;
        approve.mutate(entityId, {
            onSuccess: () => {
                toast.success(TOAST_PIPELINE.APPROVED);
                setApproveDialogOpen(false);
                onStatusChange?.();
            },
            onError: (err) => {
                toast.error(TOAST_PIPELINE.APPROVE_ERROR, {
                    description: getErrorMessage(err),
                });
            },
        });
    }, [entityId, onStatusChange, approve.mutate]);

    const handleReject = React.useCallback(() => {
        if (!entityId) return;
        reject.mutate(entityId, {
            onSuccess: () => {
                toast.success(TOAST_PIPELINE.REJECTED);
                setRejectDialogOpen(false);
                setRejectReason('');
                onStatusChange?.();
            },
            onError: (err) => {
                toast.error(TOAST_PIPELINE.REJECT_ERROR, {
                    description: getErrorMessage(err),
                });
            },
        });
    }, [entityId, onStatusChange, reject.mutate]);

    const handleArchive = React.useCallback(() => {
        if (!entityId) return;
        archive.mutate(entityId, {
            onSuccess: () => {
                toast.success(TOAST_PIPELINE.ARCHIVED);
                setArchiveDialogOpen(false);
                onStatusChange?.();
            },
            onError: (err) => {
                toast.error(TOAST_PIPELINE.ARCHIVE_ERROR, {
                    description: getErrorMessage(err),
                });
            },
        });
    }, [entityId, onStatusChange, archive.mutate]);

    if (!entityId) return null;

    return (
        <>
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-3">
                <div className="flex items-center gap-3">
                    <div className={`h-2.5 w-2.5 rounded-full ${statusConfig.dotColor}`} />
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{statusConfig.label}</span>
                        <span className="text-muted-foreground text-sm">·</span>
                        <span className="text-muted-foreground text-sm">{statusConfig.description}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {status === PIPELINE_STATUS.DRAFT && (
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => setSubmitDialogOpen(true)}
                            aria-label="Submit pipeline for review"
                            data-testid="datahub-review-submit-btn"
                        >
                            <Send className="mr-1.5 h-3.5 w-3.5" />
                            Submit for Review
                        </Button>
                    )}

                    {status === PIPELINE_STATUS.REVIEW && (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRejectDialogOpen(true)}
                                aria-label="Reject pipeline and return to draft"
                                data-testid="datahub-review-reject-btn"
                            >
                                <XCircle className="mr-1.5 h-3.5 w-3.5" />
                                Reject
                            </Button>
                            <Button
                                variant="default"
                                size="sm"
                                onClick={() => setApproveDialogOpen(true)}
                                aria-label="Approve and publish pipeline"
                                data-testid="datahub-review-approve-btn"
                            >
                                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                Approve
                            </Button>
                        </>
                    )}

                    {status === PIPELINE_STATUS.PUBLISHED && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setArchiveDialogOpen(true)}
                            aria-label="Archive pipeline"
                            data-testid="datahub-review-archive-btn"
                        >
                            <Archive className="mr-1.5 h-3.5 w-3.5" />
                            Archive
                        </Button>
                    )}

                    {status === PIPELINE_STATUS.ARCHIVED && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSubmitDialogOpen(true)}
                            aria-label="Reactivate archived pipeline"
                            data-testid="datahub-review-reactivate-btn"
                        >
                            <Play className="mr-1.5 h-3.5 w-3.5" />
                            Reactivate
                        </Button>
                    )}
                </div>
            </div>

            {/* Submit for Review Dialog */}
            <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Submit for Review</DialogTitle>
                        <DialogDescription>
                            A reviewer will check the configuration before publishing.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <p className="text-sm text-muted-foreground">
                            Make sure you've saved all changes before submitting.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setSubmitDialogOpen(false)}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleSubmitForReview} disabled={isSubmitting}>
                            {isSubmitting ? 'Submitting...' : 'Submit'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Approve Dialog */}
            <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Approve Pipeline</DialogTitle>
                        <DialogDescription>
                            This will publish the pipeline and make it active.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2 space-y-2 text-sm text-muted-foreground">
                        <p>By approving, you confirm:</p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>Configuration has been reviewed</li>
                            <li>Data mappings are correct</li>
                            <li>Ready for production use</li>
                        </ul>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setApproveDialogOpen(false)}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleApprove} disabled={isSubmitting}>
                            {isSubmitting ? 'Approving...' : 'Approve'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject Dialog */}
            <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Reject Pipeline</DialogTitle>
                        <DialogDescription>
                            Return to draft status with feedback.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2 space-y-3">
                        <div className="space-y-2">
                            <label className="flex items-center gap-1.5 text-sm font-medium">
                                <MessageSquare className="h-4 w-4" />
                                Notes (optional)
                            </label>
                            <Textarea
                                placeholder="What needs to be changed..."
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                rows={3}
                                className="resize-none"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setRejectDialogOpen(false);
                                setRejectReason('');
                            }}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleReject}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Rejecting...' : 'Reject'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Archive Dialog */}
            <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Archive Pipeline</DialogTitle>
                        <DialogDescription>
                            This will disable the pipeline and stop all scheduled runs.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <p className="text-sm text-muted-foreground">
                            You can reactivate the pipeline later by submitting it for review again.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setArchiveDialogOpen(false)}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleArchive}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Archiving...' : 'Archive'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
