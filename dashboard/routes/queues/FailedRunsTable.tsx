import * as React from 'react';
import { Button } from '@vendure/dashboard';
import type { FailedRun } from './Types';
import { formatDateTime } from '../../utils';

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
                <button className="underline underline-offset-2 hover:text-foreground" onClick={handleClick}>
                    {run.id}
                </button>
            </td>
            <td className="px-3 py-2 font-mono text-muted-foreground">{run.code}</td>
            <td className="px-3 py-2">{run.finishedAt ? formatDateTime(run.finishedAt) : '—'}</td>
            <td className="px-3 py-2 max-w-[640px] truncate" title={run.error ?? ''}>
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
    const ITEMS_PER_PAGE = 10;
    const [displayCount, setDisplayCount] = React.useState(ITEMS_PER_PAGE);

    const displayedRuns = recentFailed.slice(0, displayCount);
    const hasMore = displayCount < recentFailed.length;

    const handleLoadMore = React.useCallback(() => {
        setDisplayCount(c => c + ITEMS_PER_PAGE);
    }, []);

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
            {hasMore && (
                <div className="flex justify-center mt-4">
                    <Button variant="outline" onClick={handleLoadMore}>
                        Load More ({recentFailed.length - displayCount} remaining)
                    </Button>
                </div>
            )}
        </div>
    );
}
