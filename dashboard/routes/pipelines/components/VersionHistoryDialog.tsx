import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';

import {
    Badge,
    Button,
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@vendure/dashboard';
import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { pipelineTimelineDocument, pipelineKeys } from '../../../hooks';
import {
    DIALOG_DIMENSIONS,
    PIPELINE_STATUS,
    PIPELINE_STATUS_TRANSLATION_IDS,
    REVISION_RUN_STATUS_TRANSLATION_IDS,
    REVISION_TYPE,
    RUN_STATUS,
    UI_LIMITS,
} from '../../../constants';
import { formatDateTime } from '../../../utils';
import type { PipelineStatus } from '../../../constants';
import type { AppliedPipelineRevision } from '../../../hooks/api/use-pipeline-revisions';
import { PipelineRevisionActions } from './PipelineRevisionActions';

export interface TimelineEntry {
    revision: {
        id: string | number;
        createdAt: string;
        version: number;
        type: string;
        commitMessage?: string | null;
        authorName?: string | null;
        changesSummary?: unknown;
        isLatest: boolean;
        isCurrent: boolean;
    };
    runCount: number;
    lastRunAt?: string | null;
    lastRunStatus?: string | null;
}

export interface VersionHistoryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    pipelineId: string | undefined;
    pipelineStatus?: PipelineStatus;
    hasUnsavedChanges: boolean;
    readOnly: boolean;
    onRevisionApplied: (pipeline: AppliedPipelineRevision) => void;
}

export function VersionHistoryDialog({
    open,
    onOpenChange,
    pipelineId,
    pipelineStatus,
    hasUnsavedChanges,
    readOnly,
    onRevisionApplied,
}: VersionHistoryDialogProps) {
    const { i18n, t } = useLingui();
    const timelineLimit = UI_LIMITS.TIMELINE_LIMIT;
    const { data: timeline = [], isPending: historyPending, isError } = useQuery({
        queryKey: pipelineKeys.timeline(pipelineId ?? '', timelineLimit),
        queryFn: () =>
            api.query(pipelineTimelineDocument, { pipelineId: pipelineId!, limit: timelineLimit })
                .then(res => (res?.dataHubPipelineTimeline ?? []) as TimelineEntry[]),
        enabled: open && !!pipelineId,
    });
    const currentRevisionId = timeline.find(entry => entry.revision.isCurrent)
        ?.revision.id;
    const countMessage = (
        count: number,
        kind: 'RUN' | 'ADDED' | 'REMOVED' | 'MODIFIED' | 'CHANGE',
    ): string => {
        switch (kind) {
            case 'RUN': return count === 1 ? t`${count} run` : t`${count} runs`;
            case 'ADDED': return count === 1 ? t`+${count} step` : t`+${count} steps`;
            case 'REMOVED': return count === 1 ? t`-${count} step` : t`-${count} steps`;
            case 'MODIFIED': return t`~${count} modified`;
            case 'CHANGE': return count === 1 ? t`${count} change` : t`${count} changes`;
        }
    };
    const revisionTypeLabel = (type: string): string => {
        if (type === REVISION_TYPE.PUBLISHED) {
            return i18n._(PIPELINE_STATUS_TRANSLATION_IDS.PUBLISHED);
        }
        if (type === REVISION_TYPE.DRAFT) {
            return i18n._(PIPELINE_STATUS_TRANSLATION_IDS.DRAFT);
        }
        return type;
    };
    const runStatusLabel = (status: string): string => {
        const id = REVISION_RUN_STATUS_TRANSLATION_IDS[
            status as keyof typeof REVISION_RUN_STATUS_TRANSLATION_IDS
        ];
        return id ? i18n._(id) : status;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={`${DIALOG_DIMENSIONS.MAX_WIDTH_2XL} ${DIALOG_DIMENSIONS.MAX_HEIGHT_80VH} flex flex-col`}>
                <DialogHeader className="flex-none">
                    <DialogTitle>
                        <Trans>Version history</Trans>
                    </DialogTitle>
                    <DialogDescription>
                        <Trans>Timeline of pipeline revisions</Trans>
                        {timeline.length === timelineLimit && (
                            <span className="block">
                                <Trans>Showing the latest {timelineLimit} revisions.</Trans>
                            </span>
                        )}
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-auto">
                    {isError ? (
                        <p className="text-sm text-destructive text-center py-4">
                            <Trans>Failed to load version history</Trans>
                        </p>
                    ) : historyPending ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                            <Trans>Loading...</Trans>
                        </div>
                    ) : timeline.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                            <Trans>No version history</Trans>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {timeline.map((entry) => (
                                <div
                                    key={String(entry.revision.id)}
                                    className={`border rounded-md p-3 ${entry.revision.isCurrent ? 'border-primary bg-primary/5' : ''}`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">
                                                {entry.revision.type === REVISION_TYPE.PUBLISHED
                                                    ? `v${entry.revision.version}`
                                                    : revisionTypeLabel(entry.revision.type)}
                                            </span>
                                            {entry.revision.isCurrent && (
                                                <Badge variant="default" className="text-xs">
                                                    {pipelineStatus === PIPELINE_STATUS.ARCHIVED
                                                        ? <Trans>Last published</Trans>
                                                        : <Trans>Active published</Trans>}
                                                </Badge>
                                            )}
                                            {entry.revision.isLatest && !entry.revision.isCurrent && (
                                                <Badge variant="secondary" className="text-xs">
                                                    <Trans>Latest</Trans>
                                                </Badge>
                                            )}
                                            <Badge variant={entry.revision.type === REVISION_TYPE.PUBLISHED ? 'default' : 'outline'} className="text-xs">
                                                {revisionTypeLabel(entry.revision.type)}
                                            </Badge>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            {formatDateTime(
                                                entry.revision.createdAt,
                                                undefined,
                                                i18n.locale,
                                            )}
                                        </span>
                                    </div>
                                    {entry.revision.commitMessage && (
                                        <div className="text-sm text-foreground mb-1">{entry.revision.commitMessage}</div>
                                    )}
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                        {entry.revision.authorName && (
                                            <span>
                                                <Trans>by {entry.revision.authorName}</Trans>
                                            </span>
                                        )}
                                        {entry.runCount > 0 && (
                                            <span>
                                                {countMessage(
                                                    entry.runCount,
                                                    'RUN',
                                                )}
                                            </span>
                                        )}
                                        {entry.lastRunStatus && (
                                            <span className={entry.lastRunStatus === 'SUCCESS' ? 'text-green-600 dark:text-green-400' : entry.lastRunStatus === RUN_STATUS.FAILED ? 'text-red-600 dark:text-red-400' : ''}>
                                                <Trans>Last: {runStatusLabel(entry.lastRunStatus)}</Trans>
                                            </span>
                                        )}
                                    </div>
                                    {entry.revision.changesSummary != null && typeof entry.revision.changesSummary === 'object' && (
                                        <div className="mt-2 text-xs text-muted-foreground">
                                            {(() => {
                                                const cs = entry.revision.changesSummary as { stepsAdded?: string[]; stepsRemoved?: string[]; stepsModified?: string[]; totalChanges?: number };
                                                const parts: string[] = [];
                                                if (cs.stepsAdded?.length) {
                                                    parts.push(countMessage(
                                                        cs.stepsAdded.length,
                                                        'ADDED',
                                                    ));
                                                }
                                                if (cs.stepsRemoved?.length) {
                                                    parts.push(countMessage(
                                                        cs.stepsRemoved.length,
                                                        'REMOVED',
                                                    ));
                                                }
                                                if (cs.stepsModified?.length) {
                                                    parts.push(countMessage(
                                                        cs.stepsModified.length,
                                                        'MODIFIED',
                                                    ));
                                                }
                                                const totalChanges = cs.totalChanges ?? 0;
                                                return parts.length
                                                    ? parts.join(', ')
                                                    : countMessage(
                                                        totalChanges,
                                                        'CHANGE',
                                                    );
                                            })()}
                                        </div>
                                    )}
                                    <PipelineRevisionActions
                                        revision={{
                                            ...entry.revision,
                                            id: String(entry.revision.id),
                                        }}
                                        currentRevisionId={
                                            currentRevisionId == null
                                                ? undefined
                                                : String(currentRevisionId)
                                        }
                                        pipelineId={pipelineId}
                                        pipelineStatus={pipelineStatus}
                                        hasUnsavedChanges={hasUnsavedChanges}
                                        readOnly={readOnly}
                                        onRevisionApplied={onRevisionApplied}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-2 pt-3 flex-none">
                    <DialogClose asChild>
                        <Button variant="secondary">
                            <Trans>Close</Trans>
                        </Button>
                    </DialogClose>
                </div>
            </DialogContent>
        </Dialog>
    );
}
