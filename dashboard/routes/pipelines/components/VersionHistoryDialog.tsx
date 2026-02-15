import * as React from 'react';
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
import { REVISION_TYPE, UI_LIMITS, DIALOG_DIMENSIONS } from '../../../constants';
import { formatDateTime } from '../../../utils';

export interface TimelineEntry {
    revision: {
        id: string;
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
}

export function VersionHistoryDialog({
    open,
    onOpenChange,
    pipelineId,
}: VersionHistoryDialogProps) {
    const { data: timeline = [], isPending: historyPending } = useQuery({
        queryKey: pipelineKeys.timeline(pipelineId ?? '', UI_LIMITS.TIMELINE_LIMIT),
        queryFn: () =>
            api.query(pipelineTimelineDocument, { pipelineId: pipelineId!, limit: UI_LIMITS.TIMELINE_LIMIT })
                .then(res => (res?.dataHubPipelineTimeline ?? []) as TimelineEntry[]),
        enabled: open && !!pipelineId,
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={`${DIALOG_DIMENSIONS.MAX_WIDTH_2XL} ${DIALOG_DIMENSIONS.MAX_HEIGHT_80VH} flex flex-col`}>
                <DialogHeader className="flex-none">
                    <DialogTitle>Version history</DialogTitle>
                    <DialogDescription>Timeline of pipeline revisions</DialogDescription>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-auto">
                    {historyPending ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">Loading...</div>
                    ) : timeline.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">No version history</div>
                    ) : (
                        <div className="space-y-2">
                            {timeline.map((entry) => (
                                <div
                                    key={entry.revision.id}
                                    className={`border rounded-md p-3 ${entry.revision.isCurrent ? 'border-primary bg-primary/5' : ''}`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">
                                                {entry.revision.type === REVISION_TYPE.PUBLISHED ? `v${entry.revision.version}` : 'Draft'}
                                            </span>
                                            {entry.revision.isCurrent && (
                                                <Badge variant="default" className="text-xs">Current</Badge>
                                            )}
                                            {entry.revision.isLatest && !entry.revision.isCurrent && (
                                                <Badge variant="secondary" className="text-xs">Latest</Badge>
                                            )}
                                            <Badge variant={entry.revision.type === REVISION_TYPE.PUBLISHED ? 'default' : 'outline'} className="text-xs">
                                                {entry.revision.type}
                                            </Badge>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            {formatDateTime(entry.revision.createdAt)}
                                        </span>
                                    </div>
                                    {entry.revision.commitMessage && (
                                        <div className="text-sm text-foreground mb-1">{entry.revision.commitMessage}</div>
                                    )}
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                        {entry.revision.authorName && <span>by {entry.revision.authorName}</span>}
                                        {entry.runCount > 0 && <span>{entry.runCount} run{entry.runCount !== 1 ? 's' : ''}</span>}
                                        {entry.lastRunStatus && (
                                            <span className={entry.lastRunStatus === 'SUCCESS' ? 'text-green-600' : entry.lastRunStatus === 'FAILED' ? 'text-red-600' : ''}>
                                                Last: {entry.lastRunStatus}
                                            </span>
                                        )}
                                    </div>
                                    {entry.revision.changesSummary && typeof entry.revision.changesSummary === 'object' && (
                                        <div className="mt-2 text-xs text-muted-foreground">
                                            {(() => {
                                                const cs = entry.revision.changesSummary as { stepsAdded?: string[]; stepsRemoved?: string[]; stepsModified?: string[]; totalChanges?: number };
                                                const parts: string[] = [];
                                                if (cs.stepsAdded?.length) parts.push(`+${cs.stepsAdded.length} step${cs.stepsAdded.length > 1 ? 's' : ''}`);
                                                if (cs.stepsRemoved?.length) parts.push(`-${cs.stepsRemoved.length} step${cs.stepsRemoved.length > 1 ? 's' : ''}`);
                                                if (cs.stepsModified?.length) parts.push(`~${cs.stepsModified.length} modified`);
                                                return parts.length ? parts.join(', ') : `${cs.totalChanges ?? 0} changes`;
                                            })()}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-2 pt-3 flex-none">
                    <DialogClose asChild>
                        <Button variant="secondary">Close</Button>
                    </DialogClose>
                </div>
            </DialogContent>
        </Dialog>
    );
}
