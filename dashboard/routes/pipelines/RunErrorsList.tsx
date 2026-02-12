import * as React from 'react';
import {
    Button,
    PermissionGuard,
    Json,
} from '@vendure/dashboard';
import { toast } from 'sonner';
import { DATAHUB_PERMISSIONS, TOAST_PIPELINE } from '../../constants';
import { RetryPatchHelper } from './RetryPatchHelper';
import { ErrorAuditList } from './ErrorAuditList';
import type { RunErrorsListProps } from '../../types';

interface ErrorRowProps {
    item: { id: string; stepKey?: string | null; message?: string | null; payload?: unknown };
    onStartEditing: (itemId: string) => void;
}

function ErrorRow({ item, onStartEditing }: ErrorRowProps) {
    const handleClick = React.useCallback(() => {
        onStartEditing(item.id);
    }, [onStartEditing, item.id]);

    return (
        <tr className="border-t align-top">
            <td className="px-2 py-1 font-mono text-muted-foreground">{item.stepKey}</td>
            <td className="px-2 py-1">{item.message}</td>
            <td className="px-2 py-1 align-top">
                <Json value={item.payload} />
                <ErrorAuditList errorId={item.id} />
            </td>
            <td className="px-2 py-1 align-top">
                <PermissionGuard requires={[DATAHUB_PERMISSIONS.REPLAY_RECORD]}>
                    <Button variant="outline" size="sm" onClick={handleClick} data-testid="datahub-error-retry-button">
                        Retry with patch
                    </Button>
                </PermissionGuard>
            </td>
        </tr>
    );
}

export function RunErrorsList({ runId, items, onRetry }: RunErrorsListProps) {
    const [editing, setEditing] = React.useState<{ id: string; patch: string } | null>(null);

    const handleStartEditing = React.useCallback((itemId: string) => {
        setEditing({ id: itemId, patch: '{}' });
    }, []);

    const handlePatchChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setEditing(prev => prev ? { ...prev, patch: e.target.value } : null);
    }, []);

    const handlePatchHelperChange = React.useCallback((p: Record<string, unknown>) => {
        setEditing(prev => prev ? { ...prev, patch: JSON.stringify(p, null, 2) } : null);
    }, []);

    const handleRetryClick = React.useCallback(async () => {
        if (!editing) return;
        try {
            const patch = JSON.parse(editing.patch);
            await onRetry(editing.id, patch);
            setEditing(null);
        } catch {
            toast.error(TOAST_PIPELINE.INVALID_JSON_PATCH);
        }
    }, [editing, onRetry]);

    const handleCancelEditing = React.useCallback(() => {
        setEditing(null);
    }, []);

    if (items.length === 0) {
        return <div className="text-sm text-muted-foreground">No record errors</div>;
    }

    return (
        <div className="space-y-2">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-muted">
                        <th className="text-left px-2 py-1">Step</th>
                        <th className="text-left px-2 py-1">Message</th>
                        <th className="text-left px-2 py-1">Payload</th>
                        <th className="text-left px-2 py-1">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(item => (
                        <ErrorRow
                            key={item.id}
                            item={item}
                            onStartEditing={handleStartEditing}
                        />
                    ))}
                </tbody>
            </table>
            {editing && (
                <div className="border rounded p-2 space-y-2">
                    <div className="text-sm font-medium">Patch JSON</div>
                    <textarea
                        className="w-full h-32 font-mono p-2 border rounded"
                        value={editing.patch}
                        onChange={handlePatchChange}
                    />
                    <RetryPatchHelper onChange={handlePatchHelperChange} />
                    <div className="flex items-center gap-2">
                        <Button size="sm" onClick={handleRetryClick}>
                            Retry
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleCancelEditing}>Cancel</Button>
                    </div>
                </div>
            )}
        </div>
    );
}
