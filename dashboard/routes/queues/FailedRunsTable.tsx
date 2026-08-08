import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
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
    const { i18n, t } = useLingui();
    const handleClick = React.useCallback(() => {
        onSelectRun(run.id);
    }, [run.id, onSelectRun]);

    return (
        <tr className="border-t align-top">
            <td className="px-3 py-2 font-mono text-muted-foreground">
                <button
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground"
                    onClick={handleClick}
                    aria-label={t`Run ${run.id}`}
                >
                    {run.id}
                </button>
            </td>
            <td className="px-3 py-2 font-mono text-muted-foreground">{run.code}</td>
            <td className="px-3 py-2">{run.finishedAt ? formatDateTime(run.finishedAt, undefined, i18n.locale) : '—'}</td>
            <td className={`px-3 py-2 ${COMPONENT_WIDTHS.TABLE_CELL_MAX_LG} truncate`} title={run.error ?? ''}>
                {run.error ?? '—'}
            </td>
        </tr>
    );
});

// Failed Runs Table with load-more pagination
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
            <div className="text-sm font-medium mb-2"><Trans>Recent Failed Runs</Trans></div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <caption className="sr-only"><Trans>Recent failed pipeline runs</Trans></caption>
                <thead>
                    <tr className="bg-muted">
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>Run ID</Trans>
                        </th>
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>Pipeline</Trans>
                        </th>
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>Finished</Trans>
                        </th>
                        <th scope="col" className="text-left px-3 py-2">
                            <Trans>Error</Trans>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {displayedRuns.map((r) => (
                        <FailedRunRow key={r.id} run={r} onSelectRun={onSelectRun} />
                    ))}
                    {recentFailed.length === 0 && (
                        <tr>
                            <td className="px-3 py-4 text-muted-foreground" colSpan={4}>
                                <Trans>No recent failures</Trans>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            </div>
            {hasMore && <LoadMoreButton remaining={remaining} onClick={loadMore} />}
        </div>
    );
}
