import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    PermissionGuard,
    Badge,
} from '@vendure/dashboard';
import { Play, Square, Radio } from 'lucide-react';
import {
    DATAHUB_PERMISSIONS,
    ITEMS_PER_PAGE,
} from '../../constants';
import { useLoadMore } from '../../hooks';
import { LoadMoreButton } from '../../components/shared';
import type { Consumer } from './types';
import { formatDateTime } from '../../utils';

type ConsumerIdentity = Pick<Consumer, 'pipelineCode' | 'triggerKey'>;

function isPendingForConsumer(
    consumer: Consumer,
    pendingConsumer: ConsumerIdentity | undefined,
): boolean {
    return pendingConsumer?.pipelineCode === consumer.pipelineCode
        && pendingConsumer.triggerKey === consumer.triggerKey;
}

const ConsumerRow = React.memo(function ConsumerRow({
    consumer,
    onStop,
    onStart,
    pendingStop,
    pendingStart,
}: {
    consumer: Consumer;
    onStop: (pipelineCode: string, triggerKey: string) => void;
    onStart: (pipelineCode: string, triggerKey: string) => void;
    pendingStop?: ConsumerIdentity;
    pendingStart?: ConsumerIdentity;
}) {
    const { i18n, t } = useLingui();
    const isStopPending = isPendingForConsumer(consumer, pendingStop);
    const isStartPending = isPendingForConsumer(consumer, pendingStart);
    const handleStop = React.useCallback(() => {
        onStop(consumer.pipelineCode, consumer.triggerKey);
    }, [consumer.pipelineCode, consumer.triggerKey, onStop]);

    const handleStart = React.useCallback(() => {
        onStart(consumer.pipelineCode, consumer.triggerKey);
    }, [consumer.pipelineCode, consumer.triggerKey, onStart]);

    return (
        <tr className="border-t align-top">
            <td className="px-3 py-2 font-mono text-muted-foreground">{consumer.pipelineCode}</td>
            <td className="px-3 py-2 font-mono text-muted-foreground text-xs">{consumer.triggerKey}</td>
            <td className="px-3 py-2 font-mono text-muted-foreground text-xs">{consumer.queueName}</td>
            <td className="px-3 py-2">
                <Badge variant={consumer.isActive && consumer.desiredEnabled ? 'default' : 'secondary'}>
                    {consumer.isActive && !consumer.desiredEnabled ? (
                        <Trans>Stopping</Trans>
                    ) : consumer.isActive ? (
                        <Trans>Active</Trans>
                    ) : consumer.desiredEnabled ? (
                        <Trans>Standby</Trans>
                    ) : (
                        <Trans>Stopped</Trans>
                    )}
                </Badge>
            </td>
            <td className="px-3 py-2">
                <Badge variant={consumer.desiredEnabled ? 'default' : 'secondary'}>
                    {consumer.desiredEnabled ? <Trans>Enabled</Trans> : <Trans>Disabled</Trans>}
                </Badge>
                <div className="mt-1 text-xs text-muted-foreground">
                    {consumer.autoStart ? <Trans>Auto-start on</Trans> : <Trans>Auto-start off</Trans>}
                </div>
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
                {consumer.lastMessageAt
                    ? formatDateTime(consumer.lastMessageAt, undefined, i18n.locale)
                    : '—'}
            </td>
            <td className="px-3 py-2">
                <PermissionGuard requires={[DATAHUB_PERMISSIONS.RUN_PIPELINE]}>
                    {consumer.desiredEnabled ? (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleStop}
                            disabled={isStopPending}
                            aria-label={t`Stop consumer for queue ${consumer.queueName}`}
                        >
                            <Square className="w-3 h-3 mr-1" />
                            <Trans>Stop</Trans>
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleStart}
                            disabled={isStartPending}
                            aria-label={t`Start consumer for queue ${consumer.queueName}`}
                        >
                            <Play className="w-3 h-3 mr-1" />
                            <Trans>Start</Trans>
                        </Button>
                    )}
                </PermissionGuard>
            </td>
        </tr>
    );
});

export function ConsumersTable({
    consumers,
    onStop,
    onStart,
    pendingStop,
    pendingStart,
}: {
    consumers: Consumer[];
    onStop: (pipelineCode: string, triggerKey: string) => void;
    onStart: (pipelineCode: string, triggerKey: string) => void;
    pendingStop?: ConsumerIdentity;
    pendingStart?: ConsumerIdentity;
}) {
    const { displayed: displayedConsumers, hasMore, remaining, loadMore } = useLoadMore(consumers, { pageSize: ITEMS_PER_PAGE });

    return (
        <>
            <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                    <Trans>Start and stop update durable intent. A local owner reacts immediately; a remote owner can take up to 60 seconds.</Trans>
                </p>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <caption className="sr-only"><Trans>Message queue consumers</Trans></caption>
                <thead>
                    <tr className="bg-muted">
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>Pipeline</Trans>
                        </th>
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>Trigger</Trans>
                        </th>
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>Queue</Trans>
                        </th>
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>Local status</Trans>
                        </th>
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>Desired</Trans>
                        </th>
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>Processed</Trans>
                        </th>
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>Failed</Trans>
                        </th>
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>Last Message</Trans>
                        </th>
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>Actions</Trans>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {displayedConsumers.map((c) => (
                        <ConsumerRow
                            key={`${c.pipelineCode}:${c.triggerKey}`}
                            consumer={c}
                            onStop={onStop}
                            onStart={onStart}
                            pendingStop={pendingStop}
                            pendingStart={pendingStart}
                        />
                    ))}
                    {consumers.length === 0 && (
                        <tr>
                            <td className="px-3 py-8 text-muted-foreground text-center" colSpan={9}>
                                <Radio className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                                <Trans>No message queue consumers configured</Trans>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            </div>
            {hasMore && <LoadMoreButton remaining={remaining} onClick={loadMore} />}
        </>
    );
}
