import * as React from 'react';
import { memo } from 'react';
import {
    Button,
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerDescription,
    Json,
} from '@vendure/dashboard';
import { Link } from '@tanstack/react-router';
import { LogLevelBadge } from './LogLevelBadge';
import { ROUTES } from '../../../constants';
import { formatDateTime } from '../../../utils/formatters';
import type { DataHubLog } from '../../../types';

export interface LogDetailDrawerProps {
    log: DataHubLog | null;
    onClose: () => void;
}

/**
 * Drawer component that displays detailed information about a selected log entry.
 * Shows message, context, metadata, and links to related pipeline.
 */
export const LogDetailDrawer = memo(function LogDetailDrawer({ log, onClose }: LogDetailDrawerProps) {
    const handleOpenChange = React.useCallback((open: boolean) => {
        if (!open) onClose();
    }, [onClose]);

    return (
        <Drawer open={!!log} onOpenChange={handleOpenChange}>
            <DrawerContent data-testid="datahub-log-detail-drawer">
                <DrawerHeader>
                    <DrawerTitle>Log Details</DrawerTitle>
                    <DrawerDescription>
                        {log?.createdAt ? formatDateTime(log.createdAt) : ''}
                    </DrawerDescription>
                </DrawerHeader>
                {log && (
                    <div className="p-4 space-y-4">
                        <div className="flex items-center gap-3">
                            <LogLevelBadge level={log.level} />
                            {log.pipeline && (
                                <Button asChild variant="link" size="sm" className="p-0 h-auto">
                                    <Link
                                        to={`${ROUTES.PIPELINES}/$id`}
                                        params={{ id: log.pipeline.id }}
                                    >
                                        {log.pipeline.name}
                                    </Link>
                                </Button>
                            )}
                        </div>

                        <div>
                            <div className="text-sm font-medium mb-1">Message</div>
                            <div className="p-3 bg-muted rounded-lg text-sm font-mono whitespace-pre-wrap">
                                {log.message}
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4">
                            <div>
                                <div className="text-xs text-muted-foreground">Step</div>
                                <div className="font-mono text-sm">{log.stepKey ?? '—'}</div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground">Duration</div>
                                <div className="text-sm">
                                    {log.durationMs != null ? `${log.durationMs}ms` : '—'}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground">Records Processed</div>
                                <div className="text-sm">{log.recordsProcessed ?? '—'}</div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground">Records Failed</div>
                                <div className={`text-sm ${log.recordsFailed > 0 ? 'text-red-600' : ''}`}>
                                    {log.recordsFailed ?? '—'}
                                </div>
                            </div>
                        </div>

                        {log.context && Object.keys(log.context).length > 0 && (
                            <div>
                                <div className="text-sm font-medium mb-1">Context</div>
                                <Json value={log.context} />
                            </div>
                        )}

                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <div>
                                <div className="text-sm font-medium mb-1">Metadata</div>
                                <Json value={log.metadata} />
                            </div>
                        )}

                        {log.runId && (
                            <div className="pt-3 border-t">
                                <Button asChild variant="outline" size="sm">
                                    <Link
                                        to={`${ROUTES.PIPELINES}/$id`}
                                        params={{ id: log.pipeline?.id ?? '' }}
                                    >
                                        View Pipeline
                                    </Link>
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </DrawerContent>
        </Drawer>
    );
});
