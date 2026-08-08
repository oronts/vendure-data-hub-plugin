import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    PermissionGuard,
    Json,
} from '@vendure/dashboard';
import { AlertTriangle } from 'lucide-react';
import { DATAHUB_PERMISSIONS } from '../../constants';
import { LoadMoreButton } from '../../components/shared';
import type { DeadLetter } from './types';

// Memoized row component for dead letters
const DeadLetterRow = React.memo(function DeadLetterRow({
    deadLetter,
    onRetry,
    onUnmark,
    isRetryPending,
    isUnmarkPending,
}: {
    deadLetter: DeadLetter;
    onRetry: (id: string) => void;
    onUnmark: (id: string) => void;
    isRetryPending: boolean;
    isUnmarkPending: boolean;
}) {
    const { t } = useLingui();
    const handleRetry = React.useCallback(() => {
        onRetry(deadLetter.id);
    }, [deadLetter.id, onRetry]);

    const handleUnmark = React.useCallback(() => {
        onUnmark(deadLetter.id);
    }, [deadLetter.id, onUnmark]);

    return (
        <tr className="border-t align-top">
            <td className="px-3 py-2 font-mono text-muted-foreground">{deadLetter.id}</td>
            <td className="px-3 py-2 font-mono text-muted-foreground">{deadLetter.stepKey}</td>
            <td className="px-3 py-2">{deadLetter.message}</td>
            <td className="px-3 py-2">
                <Json value={deadLetter.payload} />
            </td>
            <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                    <PermissionGuard requires={[DATAHUB_PERMISSIONS.REPLAY_RECORD]}>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleRetry}
                            disabled={isRetryPending}
                            aria-label={t`Replay dead letter ${deadLetter.id}`}
                        >
                            <Trans>Replay</Trans>
                        </Button>
                    </PermissionGuard>
                    <PermissionGuard requires={[DATAHUB_PERMISSIONS.EDIT_QUARANTINE]}>
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={handleUnmark}
                            disabled={isUnmarkPending}
                            aria-label={t`Remove dead-letter mark from ${deadLetter.id}`}
                        >
                            <Trans>Unmark</Trans>
                        </Button>
                    </PermissionGuard>
                </div>
            </td>
        </tr>
    );
});

// Dead Letters Table with virtualization
export function DeadLettersTable({
    deadLetters,
    totalItems,
    hasNextPage,
    isFetchingNextPage,
    onLoadMore,
    onRetry,
    onUnmark,
    isRetryPending,
    isUnmarkPending,
}: {
    deadLetters: DeadLetter[];
    totalItems: number;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    onLoadMore: () => void;
    onRetry: (id: string) => void;
    onUnmark: (id: string) => void;
    isRetryPending: boolean;
    isUnmarkPending: boolean;
}) {
    return (
        <div data-testid="datahub-dead-letters-table">
            <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                    <Trans>Dead letters are records that failed processing and have been marked for manual review.</Trans>
                </p>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <caption className="sr-only"><Trans>Dead-letter records awaiting manual review</Trans></caption>
                <thead>
                    <tr className="bg-muted">
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>ID</Trans>
                        </th>
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>Step</Trans>
                        </th>
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>Message</Trans>
                        </th>
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>Payload</Trans>
                        </th>
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>Actions</Trans>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {deadLetters.map((r) => (
                        <DeadLetterRow
                            key={r.id}
                            deadLetter={r}
                            onRetry={onRetry}
                            onUnmark={onUnmark}
                            isRetryPending={isRetryPending}
                            isUnmarkPending={isUnmarkPending}
                        />
                    ))}
                    {deadLetters.length === 0 && (
                        <tr>
                            <td className="px-3 py-8 text-muted-foreground text-center" colSpan={5}>
                                <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                                <Trans>No dead letters</Trans>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            </div>
            {hasNextPage && (
                <LoadMoreButton
                    remaining={Math.max(totalItems - deadLetters.length, 0)}
                    onClick={onLoadMore}
                    loading={isFetchingNextPage}
                    data-testid="datahub-dead-letters-load-more"
                />
            )}
        </div>
    );
}
