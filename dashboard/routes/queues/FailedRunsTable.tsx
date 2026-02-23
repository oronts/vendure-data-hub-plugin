import * as React from 'react';
import type { FailedRun } from './types';
import { formatDateTime } from '../../utils';
import { COMPONENT_WIDTHS } from '../../constants';
import { useLoadMore } from '../../hooks';
import { LoadMoreButton } from '../../components/shared';

// Memoized row component for failed runs
const FailedRunRow = React.memo(function FailedRunRow({
    run,
    onSelectRun,
}: {
    run: FailedRun;
    onSelectRun: (id: string) => void;
}) {
    const handleClick = React.useCallback(() => {
        onSelectRun(run.id);
    }, [run.id, onSelectRun]);

    return (
        <tr className="border-t align-top">
            <td className="px-3 py-2 font-mono text-muted-foreground">
                <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={handleClick}>
                    {run.id}
                </button>
            </td>
            <td className="px-3 py-2 font-mono text-muted-foreground">{run.code}</td>
            <td className="px-3 py-2">{run.finishedAt ? formatDateTime(run.finishedAt) : '—'}</td>
            <td className={`px-3 py-2 ${COMPONENT_WIDTHS.TABLE_CELL_MAX_LG} truncate`} title={run.error ?? ''}>
                {run.error ?? '—'}
            </td>
        </tr>
    );
});

// Failed Runs Table with virtualization
export function FailedRunsTable({
    recentFailed,
    onSelectRun,
}: {
    recentFailed: FailedRun[];
    onSelectRun: (id: string) => void;
}) {
    const { displayed: displayedRuns, hasMore, remaining, loadMore } = useLoadMore(recentFailed);

    return (
        <div className="mt-6" data-testid="datahub-failed-runs-table">
            <div className="text-sm font-medium mb-2">Recent Failed Runs</div>
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-muted">
                        <th className="text-left px-3 py-2">Run ID</th>
                        <th className="text-left px-3 py-2">Pipeline</th>
                        <th className="text-left px-3 py-2">Finished</th>
                        <th className="text-left px-3 py-2">Error</th>
                    </tr>
                </thead>
                <tbody>
                    {displayedRuns.map((r) => (
                        <FailedRunRow key={r.id} run={r} onSelectRun={onSelectRun} />
                    ))}
                    {recentFailed.length === 0 && (
                        <tr>
                            <td className="px-3 py-4 text-muted-foreground" colSpan={4}>
                                No recent failures
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            {hasMore && <LoadMoreButton remaining={remaining} onClick={loadMore} />}
        </div>
    );
}
