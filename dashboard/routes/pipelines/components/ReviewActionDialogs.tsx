import type { ReactNode } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@vendure/dashboard';
import { Trans } from '@lingui/react/macro';

type DialogSetter = (open: boolean) => void;

interface WorkflowActionDialogProps {
    open: boolean;
    onOpenChange: DialogSetter;
    title: ReactNode;
    description: ReactNode;
    details?: ReactNode;
    confirmLabel: ReactNode;
    pendingLabel: ReactNode;
    onConfirm: () => void;
    pending: boolean;
    disabled: boolean;
    destructive?: boolean;
}

function WorkflowActionDialog({
    open,
    onOpenChange,
    title,
    description,
    details,
    confirmLabel,
    pendingLabel,
    onConfirm,
    pending,
    disabled,
    destructive,
}: Readonly<WorkflowActionDialogProps>) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                {details}
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>
                        <Trans>Cancel</Trans>
                    </AlertDialogCancel>
                    <AlertDialogAction
                        type="button"
                        className={destructive
                            ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                            : undefined}
                        onClick={(event) => {
                            event.preventDefault();
                            onConfirm();
                        }}
                        disabled={disabled}
                    >
                        {pending ? pendingLabel : confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export interface ReviewActionDialogsProps {
    submitOpen: boolean;
    setSubmitOpen: DialogSetter;
    approveOpen: boolean;
    setApproveOpen: DialogSetter;
    publishOpen: boolean;
    setPublishOpen: DialogSetter;
    rejectOpen: boolean;
    setRejectOpen: DialogSetter;
    archiveOpen: boolean;
    setArchiveOpen: DialogSetter;
    reactivateOpen: boolean;
    setReactivateOpen: DialogSetter;
    onSubmit: () => void;
    onApprove: () => void;
    onPublish: () => void;
    onReject: () => void;
    onArchive: () => void;
    onReactivate: () => void;
    pending: boolean;
    actionDisabled: boolean;
    codeFirstManaged: boolean;
}

export function ReviewActionDialogs({
    submitOpen,
    setSubmitOpen,
    approveOpen,
    setApproveOpen,
    publishOpen,
    setPublishOpen,
    rejectOpen,
    setRejectOpen,
    archiveOpen,
    setArchiveOpen,
    reactivateOpen,
    setReactivateOpen,
    onSubmit,
    onApprove,
    onPublish,
    onReject,
    onArchive,
    onReactivate,
    pending,
    actionDisabled,
    codeFirstManaged,
}: Readonly<ReviewActionDialogsProps>) {
    return (
        <>
            <WorkflowActionDialog
                open={submitOpen}
                onOpenChange={setSubmitOpen}
                title={<Trans>Submit for review</Trans>}
                description={<Trans>A reviewer will check the configuration before publishing.</Trans>}
                details={(
                    <p className="py-2 text-sm text-muted-foreground">
                        <Trans>Make sure you've saved all changes before submitting.</Trans>
                    </p>
                )}
                confirmLabel={<Trans>Submit</Trans>}
                pendingLabel={<Trans>Submitting...</Trans>}
                onConfirm={onSubmit}
                pending={pending}
                disabled={actionDisabled}
            />
            <WorkflowActionDialog
                open={approveOpen}
                onOpenChange={setApproveOpen}
                title={<Trans>Approve pipeline</Trans>}
                description={<Trans>This will publish the pipeline and make it active.</Trans>}
                details={(
                    <div className="space-y-2 py-2 text-sm text-muted-foreground">
                        <p><Trans>By approving, you confirm:</Trans></p>
                        <ul className="list-disc space-y-1 pl-5">
                            <li><Trans>Configuration has been reviewed</Trans></li>
                            <li><Trans>Data mappings are correct</Trans></li>
                            <li><Trans>Ready for production use</Trans></li>
                        </ul>
                    </div>
                )}
                confirmLabel={<Trans>Approve</Trans>}
                pendingLabel={<Trans>Approving...</Trans>}
                onConfirm={onApprove}
                pending={pending}
                disabled={actionDisabled}
            />
            <WorkflowActionDialog
                open={publishOpen}
                onOpenChange={setPublishOpen}
                title={<Trans>Publish pipeline</Trans>}
                description={<Trans>Publish the submitted definition as the active pipeline version.</Trans>}
                details={(
                    <p className="py-2 text-sm text-muted-foreground">
                        <Trans>This action is available to publishing roles after a pipeline has been submitted for review.</Trans>
                    </p>
                )}
                confirmLabel={<Trans>Publish</Trans>}
                pendingLabel={<Trans>Publishing...</Trans>}
                onConfirm={onPublish}
                pending={pending}
                disabled={actionDisabled}
            />
            <WorkflowActionDialog
                open={rejectOpen}
                onOpenChange={setRejectOpen}
                title={<Trans>Reject pipeline</Trans>}
                description={<Trans>This will return the pipeline to draft status for further changes.</Trans>}
                confirmLabel={<Trans>Reject</Trans>}
                pendingLabel={<Trans>Rejecting...</Trans>}
                onConfirm={onReject}
                pending={pending}
                disabled={actionDisabled}
                destructive
            />
            <WorkflowActionDialog
                open={archiveOpen}
                onOpenChange={setArchiveOpen}
                title={<Trans>Archive pipeline</Trans>}
                description={<Trans>This will disable the pipeline and stop all scheduled runs.</Trans>}
                details={(
                    <p className="py-2 text-sm text-muted-foreground">
                        <Trans>Archived pipelines cannot be run or submitted for review.</Trans>
                    </p>
                )}
                confirmLabel={<Trans>Archive</Trans>}
                pendingLabel={<Trans>Archiving...</Trans>}
                onConfirm={onArchive}
                pending={pending}
                disabled={actionDisabled || codeFirstManaged}
                destructive
            />
            <WorkflowActionDialog
                open={reactivateOpen}
                onOpenChange={setReactivateOpen}
                title={<Trans>Reactivate pipeline</Trans>}
                description={<Trans>Restore the latest published revision and enable this pipeline.</Trans>}
                confirmLabel={<Trans>Reactivate</Trans>}
                pendingLabel={<Trans>Reactivating...</Trans>}
                onConfirm={onReactivate}
                pending={pending}
                disabled={actionDisabled || codeFirstManaged}
            />
        </>
    );
}
