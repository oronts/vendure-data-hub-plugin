import * as React from 'react';
import { formatSmartDateTime } from '../../../utils/formatters';
import { LogLevelBadge } from './LogLevelBadge';
import type { DataHubLog } from '../../../types';

export interface LogTableRowProps {
    log: DataHubLog;
    onSelect: (log: DataHubLog) => void;
}

/**
 * Memoized log row component to avoid re-creating onClick handlers in the parent loop.
 * Displays a single log entry in the log explorer table.
 */
export const LogTableRow = React.memo(function LogTableRow({
    log,
    onSelect,
}: LogTableRowProps) {
    const handleClick = React.useCallback(() => onSelect(log), [onSelect, log]);
    const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onSelect(log);
        }
    }, [onSelect, log]);

    return (
        <tr
            className="border-t hover:bg-muted/30 cursor-pointer"
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            data-testid={`datahub-log-row-${log.id}`}
        >
            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                {formatSmartDateTime(log.createdAt)}
            </td>
            <td className="px-3 py-2">
                <LogLevelBadge level={log.level} />
            </td>
            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                {log.pipeline?.code ?? '—'}
            </td>
            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                {log.stepKey ?? '—'}
            </td>
            <td className="px-3 py-2 max-w-[300px] truncate" title={log.message}>
                {log.message}
            </td>
            <td className="px-3 py-2 text-right text-muted-foreground">
                {log.durationMs != null ? `${log.durationMs}ms` : '—'}
            </td>
            <td className="px-3 py-2 text-right">
                {log.recordsProcessed != null ? (
                    <span>
                        {log.recordsProcessed}
                        {log.recordsFailed > 0 && (
                            <span className="text-red-600 ml-1">
                                ({log.recordsFailed} failed)
                            </span>
                        )}
                    </span>
                ) : (
                    '—'
                )}
            </td>
        </tr>
    );
});
