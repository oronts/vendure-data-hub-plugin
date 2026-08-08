import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    PermissionGuard,
    Json,
} from '@vendure/dashboard';
import { toast } from 'sonner';
import { DATAHUB_PERMISSIONS } from '../../constants';
import { RetryPatchHelper } from './RetryPatchHelper';
import { ErrorAuditList } from './ErrorAuditList';
import { AllPermissionsGuard, LoadMoreButton } from '../../components/shared';
import type { RunErrorsListProps } from '../../types';

interface ErrorRowProps {
    item: { id: string; stepKey?: string | null; message?: string | null; payload?: unknown };
    onStartEditing: (itemId: string) => void;
    onRetryUnchanged: (itemId: string) => void;
}

function ErrorRow({ item, onStartEditing, onRetryUnchanged }: ErrorRowProps) {
    const handlePatchClick = React.useCallback(() => {
        onStartEditing(item.id);
    }, [onStartEditing, item.id]);
    const handleRetryClick = React.useCallback(() => {
        onRetryUnchanged(item.id);
    }, [onRetryUnchanged, item.id]);

    return (
        <tr className="border-t align-top">
            <td className="px-2 py-1 font-mono text-muted-foreground">{item.stepKey}</td>
            <td className="px-2 py-1">{item.message}</td>
            <td className="px-2 py-1 align-top">
                <Json value={item.payload} />
                <ErrorAuditList errorId={item.id} />
            </td>
            <td className="px-2 py-1 align-top">
                <div className="flex flex-col items-start gap-2">
                    <PermissionGuard requires={[DATAHUB_PERMISSIONS.REPLAY_RECORD]}>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRetryClick}
                            data-testid="datahub-error-retry-button"
                        >
                            <Trans>Retry unchanged</Trans>
                        </Button>
                    </PermissionGuard>
                    <AllPermissionsGuard requires={[
                        DATAHUB_PERMISSIONS.REPLAY_RECORD,
                        DATAHUB_PERMISSIONS.EDIT_QUARANTINE,
                    ]}>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePatchClick}
                            data-testid="datahub-error-retry-with-patch-button"
                        >
                            <Trans>Retry with patch</Trans>
                        </Button>
                    </AllPermissionsGuard>
                </div>
            </td>
        </tr>
    );
}

export function RunErrorsList({
    items,
    totalItems,
    hasNextPage,
    isFetchingNextPage,
    onLoadMore,
    onRetry,
}: RunErrorsListProps) {
    const { t } = useLingui();
    const [editing, setEditing] = React.useState<{ id: string; patch: string } | null>(null);

    const handleStartEditing = React.useCallback((itemId: string) => {
        setEditing({ id: itemId, patch: '{}' });
    }, []);
    const handleRetryUnchanged = React.useCallback((itemId: string) => {
        void onRetry(itemId, {});
    }, [onRetry]);

    const handlePatchChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setEditing(prev => prev ? { ...prev, patch: e.target.value } : null);
    }, []);

    const handlePatchHelperChange = React.useCallback((p: Record<string, unknown>) => {
        setEditing(prev => prev ? { ...prev, patch: JSON.stringify(p, null, 2) } : null);
    }, []);

    const handleRetryClick = React.useCallback(async () => {
        if (!editing) return;
        let patch: Record<string, unknown>;
        try {
            patch = JSON.parse(editing.patch);
        } catch {
            toast.error(t`Enter a valid JSON patch`);
            return;
        }
        const applied = await onRetry(editing.id, patch);
        if (applied) {
            setEditing(null);
        }
    }, [editing, onRetry, t]);

    const handleCancelEditing = React.useCallback(() => {
        setEditing(null);
    }, []);

    if (items.length === 0) {
        return (
            <div className="text-sm text-muted-foreground">
                <Trans>No record errors</Trans>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <caption className="sr-only"><Trans>Record errors captured during this run</Trans></caption>
                <thead>
                    <tr className="bg-muted">
                        <th scope="col" className="text-left px-2 py-1">
                            <Trans>Step</Trans>
                        </th>
                        <th scope="col" className="text-left px-2 py-1">
                            <Trans>Message</Trans>
                        </th>
                        <th scope="col" className="text-left px-2 py-1">
                            <Trans>Payload</Trans>
                        </th>
                        <th scope="col" className="text-left px-2 py-1">
                            <Trans>Actions</Trans>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(item => (
                        <ErrorRow
                            key={item.id}
                            item={item}
                            onStartEditing={handleStartEditing}
                            onRetryUnchanged={handleRetryUnchanged}
                        />
                    ))}
                </tbody>
            </table>
            </div>
            {hasNextPage && (
                <LoadMoreButton
                    remaining={Math.max(totalItems - items.length, 0)}
                    onClick={onLoadMore}
                    loading={isFetchingNextPage}
                    data-testid="datahub-run-errors-load-more"
                />
            )}
            {editing && (
                <div className="border rounded p-2 space-y-2">
                    <label htmlFor="retry-patch-json" className="text-sm font-medium">
                        <Trans>Patch JSON</Trans>
                    </label>
                    <textarea
                        id="retry-patch-json"
                        className="w-full h-32 font-mono p-2 border rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                        aria-label={t`JSON patch for retry`}
                        value={editing.patch}
                        onChange={handlePatchChange}
                    />
                    <RetryPatchHelper onChange={handlePatchHelperChange} />
                    <div className="flex items-center gap-2">
                        <Button size="sm" onClick={handleRetryClick}>
                            <Trans>Retry</Trans>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleCancelEditing}>
                            <Trans>Cancel</Trans>
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
