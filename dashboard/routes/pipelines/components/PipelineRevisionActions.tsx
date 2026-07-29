import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    PermissionGuard,
} from '@vendure/dashboard';
import { GitCompare, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '../../../../shared';
import {
    DATAHUB_PERMISSIONS,
    PIPELINE_STATUS_TRANSLATION_IDS,
    REVISION_TYPE,
} from '../../../constants';
import type { PipelineStatus } from '../../../constants';
import {
    usePipelineRevisionDiff,
    useRestorePipelineDraft,
    useRevertPipelineRevision,
} from '../../../hooks/api/use-pipeline-revisions';
import type { AppliedPipelineRevision } from '../../../hooks/api/use-pipeline-revisions';
import { getPipelineVersionActions } from '../../../utils/pipeline-version-actions';

interface TimelineRevision {
    id: string;
    version: number;
    type: string;
    isLatest: boolean;
    isCurrent: boolean;
}

export interface PipelineRevisionActionsProps {
    revision: TimelineRevision;
    currentRevisionId?: string;
    pipelineId?: string;
    pipelineStatus?: PipelineStatus;
    hasUnsavedChanges: boolean;
    readOnly: boolean;
    onRevisionApplied: (pipeline: AppliedPipelineRevision) => void;
}

type RevisionMutation = 'RESTORE_DRAFT' | 'REVERT_PUBLISHED';

interface DiffEntry {
    path: string;
    label: string;
    type: string;
    before?: unknown;
    after?: unknown;
}

function formatDiffValue(value: unknown): string {
    if (value === undefined) return '—';
    try {
        return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
        return String(value);
    }
}

function DiffEntries({ title, entries }: Readonly<{ title: string; entries: readonly DiffEntry[] }>) {
    if (entries.length === 0) return null;
    return (
        <section className="space-y-2">
            <h4 className="text-sm font-medium">{title} ({entries.length})</h4>
            {entries.map((entry, index) => (
                <div key={`${entry.path}-${index}`} className="rounded-md border p-3 text-xs">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="font-medium">{entry.label}</span>
                        <span className="text-muted-foreground">{entry.type} · {entry.path}</span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                        <pre className="overflow-auto rounded bg-muted p-2 whitespace-pre-wrap">
                            {formatDiffValue(entry.before)}
                        </pre>
                        <pre className="overflow-auto rounded bg-muted p-2 whitespace-pre-wrap">
                            {formatDiffValue(entry.after)}
                        </pre>
                    </div>
                </div>
            ))}
        </section>
    );
}

export function PipelineRevisionActions({
    revision,
    currentRevisionId,
    pipelineId,
    pipelineStatus,
    hasUnsavedChanges,
    readOnly,
    onRevisionApplied,
}: Readonly<PipelineRevisionActionsProps>) {
    const { i18n, t } = useLingui();
    const [compareOpen, setCompareOpen] = React.useState(false);
    const [pendingAction, setPendingAction] = React.useState<RevisionMutation>();
    const actions = getPipelineVersionActions(revision, currentRevisionId, pipelineStatus);
    const diff = usePipelineRevisionDiff(
        compareOpen ? revision.id : undefined,
        compareOpen ? currentRevisionId : undefined,
    );
    const restoreDraft = useRestorePipelineDraft(pipelineId);
    const revertPublished = useRevertPipelineRevision(pipelineId);
    const mutationPending = restoreDraft.isPending || revertPublished.isPending;
    const mutationDisabled = readOnly || hasUnsavedChanges || mutationPending;
    const disabledReason = hasUnsavedChanges
        ? t`Save or discard local changes before applying a historical revision`
        : undefined;

    const applyRevision = React.useCallback(() => {
        const mutation = pendingAction === 'RESTORE_DRAFT'
            ? restoreDraft
            : revertPublished;
        mutation.mutate(revision.id, {
            onSuccess: pipeline => {
                toast.success(
                    pendingAction === 'RESTORE_DRAFT'
                        ? t`Draft restored`
                        : t`Published version restored as a new version`,
                );
                setPendingAction(undefined);
                onRevisionApplied(pipeline);
            },
            onError: error => {
                toast.error(
                    pendingAction === 'RESTORE_DRAFT'
                        ? t`Failed to restore draft`
                        : t`Failed to restore published version`,
                    { description: getErrorMessage(error) },
                );
            },
        });
    }, [onRevisionApplied, pendingAction, restoreDraft, revertPublished, revision.id, t]);

    if (!actions.compare && !actions.restoreDraft && !actions.revertPublished) {
        return null;
    }

    return (
        <>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
                {actions.compare && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setCompareOpen(true)}
                        aria-label={t`Compare revision ${revision.id} with the current revision`}
                    >
                        <GitCompare className="mr-1.5 h-3.5 w-3.5" />
                        <Trans>Compare to current</Trans>
                    </Button>
                )}
                {actions.restoreDraft && (
                    <PermissionGuard requires={[DATAHUB_PERMISSIONS.UPDATE_PIPELINE]}>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setPendingAction('RESTORE_DRAFT')}
                            disabled={mutationDisabled}
                            title={disabledReason}
                        >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            <Trans>Restore draft</Trans>
                        </Button>
                    </PermissionGuard>
                )}
                {actions.revertPublished && (
                    <PermissionGuard requires={[DATAHUB_PERMISSIONS.PUBLISH_PIPELINE]}>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setPendingAction('REVERT_PUBLISHED')}
                            disabled={mutationDisabled}
                            title={disabledReason}
                        >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            <Trans>Restore as new version</Trans>
                        </Button>
                    </PermissionGuard>
                )}
            </div>

            <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                    <DialogHeader>
                        <DialogTitle>
                            <Trans>Revision comparison</Trans>
                        </DialogTitle>
                        <DialogDescription>
                            <Trans>Comparing {revision.type === REVISION_TYPE.PUBLISHED
                                        ? `v${revision.version}`
                                        : i18n._(PIPELINE_STATUS_TRANSLATION_IDS.DRAFT)} with the current published revision.</Trans>
                        </DialogDescription>
                    </DialogHeader>
                    {diff.isPending ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            <Trans>Loading comparison...</Trans>
                        </p>
                    ) : diff.isError ? (
                        <div className="space-y-1 py-8 text-center text-sm text-destructive">
                            <p><Trans>Failed to compare revisions</Trans></p>
                            <p className="text-xs">{getErrorMessage(diff.error)}</p>
                        </div>
                    ) : diff.data ? (
                        <div className="space-y-4">
                            <p className="text-sm">{diff.data.summary}</p>
                            <DiffEntries
                                title={t`Added`}
                                entries={diff.data.added}
                            />
                            <DiffEntries
                                title={t`Removed`}
                                entries={diff.data.removed}
                            />
                            <DiffEntries
                                title={t`Modified`}
                                entries={diff.data.modified}
                            />
                            {diff.data.added.length === 0
                                && diff.data.removed.length === 0
                                && diff.data.modified.length === 0 && (
                                <p className="rounded-md border p-4 text-sm text-muted-foreground">
                                    <Trans>No executable differences found.</Trans>
                                </p>
                            )}
                        </div>
                    ) : null}
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => setCompareOpen(false)}>
                            <Trans>Close</Trans>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={pendingAction != null}
                onOpenChange={open => {
                    if (!open && !mutationPending) setPendingAction(undefined);
                }}
            >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {pendingAction === 'RESTORE_DRAFT'
                                ? <Trans>Restore draft revision?</Trans>
                                : <Trans>Restore published version?</Trans>}
                        </DialogTitle>
                        <DialogDescription>
                            {pendingAction === 'RESTORE_DRAFT'
                                ? <Trans>This replaces the saved working definition and returns the pipeline to draft status.</Trans>
                                : <Trans>This publishes the selected definition as a new version. Existing version history remains unchanged.</Trans>}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPendingAction(undefined)}
                            disabled={mutationPending}
                        >
                            <Trans>Cancel</Trans>
                        </Button>
                        <Button type="button" onClick={applyRevision} disabled={mutationDisabled}>
                            {mutationPending
                                ? <Trans>Restoring...</Trans>
                                : <Trans>Restore</Trans>}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
