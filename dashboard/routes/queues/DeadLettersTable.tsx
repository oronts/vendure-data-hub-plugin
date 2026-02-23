import * as React from 'react';
import {
    Button,
    PermissionGuard,
    Json,
} from '@vendure/dashboard';
import { AlertTriangle } from 'lucide-react';
import { DATAHUB_PERMISSIONS, ITEMS_PER_PAGE } from '../../constants';
import { useLoadMore } from '../../hooks';
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
                        <Button size="sm" variant="outline" onClick={handleRetry} disabled={isRetryPending}>
                            Replay
                        </Button>
                    </PermissionGuard>
                    <PermissionGuard requires={[DATAHUB_PERMISSIONS.EDIT_QUARANTINE]}>
                        <Button size="sm" variant="destructive" onClick={handleUnmark} disabled={isUnmarkPending}>
                            Unmark
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
    onRetry,
    onUnmark,
    isRetryPending,
    isUnmarkPending,
}: {
    deadLetters: DeadLetter[];
    onRetry: (id: string) => void;
    onUnmark: (id: string) => void;
    isRetryPending: boolean;
    isUnmarkPending: boolean;
}) {
    const { displayed: displayedLetters, hasMore, remaining, loadMore } = useLoadMore(deadLetters, { pageSize: ITEMS_PER_PAGE });

    return (
        <div data-testid="datahub-dead-letters-table">
            <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                    Dead letters are records that failed processing and have been marked for manual review.
                </p>
            </div>
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-muted">
                        <th className="text-left px-3 py-2">ID</th>
                        <th className="text-left px-3 py-2">Step</th>
                        <th className="text-left px-3 py-2">Message</th>
                        <th className="text-left px-3 py-2">Payload</th>
                        <th className="text-left px-3 py-2">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {displayedLetters.map((r) => (
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
                                No dead letters
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            {hasMore && <LoadMoreButton remaining={remaining} onClick={loadMore} />}
        </div>
    );
}
