import * as React from 'react';
import {
    Button,
    PermissionGuard,
    Badge,
} from '@vendure/dashboard';
import { Play, Square, Radio } from 'lucide-react';
import { DATAHUB_PERMISSIONS, ITEMS_PER_PAGE } from '../../constants';
import { useLoadMore } from '../../hooks';
import { LoadMoreButton } from '../../components/shared';
import type { Consumer } from './types';
import { formatDateTime } from '../../utils';

// Memoized row component for consumers
const ConsumerRow = React.memo(function ConsumerRow({
    consumer,
    onStop,
    onStart,
    isStopPending,
    isStartPending,
}: {
    consumer: Consumer;
    onStop: (pipelineCode: string) => void;
    onStart: (pipelineCode: string) => void;
    isStopPending: boolean;
    isStartPending: boolean;
}) {
    const handleStop = React.useCallback(() => {
        onStop(consumer.pipelineCode);
    }, [consumer.pipelineCode, onStop]);

    const handleStart = React.useCallback(() => {
        onStart(consumer.pipelineCode);
    }, [consumer.pipelineCode, onStart]);

    return (
        <tr className="border-t align-top">
            <td className="px-3 py-2 font-mono text-muted-foreground">{consumer.pipelineCode}</td>
            <td className="px-3 py-2 font-mono text-muted-foreground text-xs">{consumer.queueName}</td>
            <td className="px-3 py-2">
                <Badge variant={consumer.isActive ? 'default' : 'secondary'}>
                    {consumer.isActive ? 'Active' : 'Stopped'}
                </Badge>
            </td>
            <td className="px-3 py-2">{consumer.messagesProcessed}</td>
            <td className="px-3 py-2">
                {consumer.messagesFailed > 0 ? (
                    <span className="text-destructive">{consumer.messagesFailed}</span>
                ) : (
                    consumer.messagesFailed
                )}
            </td>
            <td className="px-3 py-2">
                {consumer.lastMessageAt ? formatDateTime(consumer.lastMessageAt) : '—'}
            </td>
            <td className="px-3 py-2">
                <PermissionGuard requires={[DATAHUB_PERMISSIONS.UPDATE_PIPELINE]}>
                    {consumer.isActive ? (
                        <Button size="sm" variant="outline" onClick={handleStop} disabled={isStopPending}>
                            <Square className="w-3 h-3 mr-1" />
                            Stop
                        </Button>
                    ) : (
                        <Button size="sm" variant="outline" onClick={handleStart} disabled={isStartPending}>
                            <Play className="w-3 h-3 mr-1" />
                            Start
                        </Button>
                    )}
                </PermissionGuard>
            </td>
        </tr>
    );
});

// Consumers Table with virtualization
export function ConsumersTable({
    consumers,
    onStop,
    onStart,
    isStopPending,
    isStartPending,
}: {
    consumers: Consumer[];
    onStop: (pipelineCode: string) => void;
    onStart: (pipelineCode: string) => void;
    isStopPending: boolean;
    isStartPending: boolean;
}) {
    const { displayed: displayedConsumers, hasMore, remaining, loadMore } = useLoadMore(consumers, { pageSize: ITEMS_PER_PAGE });

    return (
        <>
            <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                    Message queue consumers that process pipeline triggers. Start/stop consumers to manage message processing.
                </p>
            </div>
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-muted">
                        <th className="text-left px-3 py-2">Pipeline</th>
                        <th className="text-left px-3 py-2">Queue</th>
                        <th className="text-left px-3 py-2">Status</th>
                        <th className="text-left px-3 py-2">Processed</th>
                        <th className="text-left px-3 py-2">Failed</th>
                        <th className="text-left px-3 py-2">Last Message</th>
                        <th className="text-left px-3 py-2">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {displayedConsumers.map((c) => (
                        <ConsumerRow
                            key={c.pipelineCode}
                            consumer={c}
                            onStop={onStop}
                            onStart={onStart}
                            isStopPending={isStopPending}
                            isStartPending={isStartPending}
                        />
                    ))}
                    {consumers.length === 0 && (
                        <tr>
                            <td className="px-3 py-8 text-muted-foreground text-center" colSpan={7}>
                                <Radio className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                                No message queue consumers configured
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            {hasMore && <LoadMoreButton remaining={remaining} onClick={loadMore} />}
        </>
    );
}
