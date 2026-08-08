import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button, Json } from '@vendure/dashboard';
import { useErrorAudits } from '../../hooks';
import { formatDateTime } from '../../utils';
import { ErrorState, LoadingState } from '../../components/shared';
import { getErrorMessage } from '../../../shared';

export function ErrorAuditList({ errorId }: { errorId: string }) {
    const [expanded, setExpanded] = React.useState(false);

    if (!expanded) {
        return (
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setExpanded(true)}
            >
                <Trans>Load audit trail</Trans>
            </Button>
        );
    }

    return <LoadedErrorAuditList errorId={errorId} onCollapse={() => setExpanded(false)} />;
}

function LoadedErrorAuditList({ errorId, onCollapse }: { errorId: string; onCollapse: () => void }) {
    const { i18n, t } = useLingui();
    const locale = i18n.locale;
    const auditsQuery = useErrorAudits(errorId);
    const audits = auditsQuery.data;

    if (auditsQuery.isLoading) {
        return (
            <LoadingState
                className="mt-2"
                message={t`Loading audit trail...`}
            />
        );
    }

    if (auditsQuery.isError) {
        return (
            <div className="mt-2 space-y-2">
                <ErrorState
                    title={t`Failed to load audit trail`}
                    message={getErrorMessage(auditsQuery.error)}
                    onRetry={() => void auditsQuery.refetch()}
                />
                <Button type="button" variant="ghost" size="sm" onClick={onCollapse}>
                    <Trans>Hide</Trans>
                </Button>
            </div>
        );
    }

    if (!audits?.length) {
        return (
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={onCollapse}>
                <Trans>No retry audit entries</Trans>
            </Button>
        );
    }

    return (
        <div className="mt-2 border rounded p-2">
            <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium">
                    <Trans>Retry audit trail</Trans>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={onCollapse}>
                    <Trans>Hide</Trans>
                </Button>
            </div>
            <div className="space-y-2">
                {audits.map(a => (
                    <div key={a.id} className="text-xs">
                        <div className="text-muted-foreground">
                            {formatDateTime(String(a.createdAt), undefined, locale)} ·{' '}
                            <Trans>user {a.userId ?? '—'}</Trans>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <div>
                                <div className="font-medium">
                                    <Trans>Previous</Trans>
                                </div>
                                <Json value={a.previousPayload} />
                            </div>
                            <div>
                                <div className="font-medium">
                                    <Trans>Patch</Trans>
                                </div>
                                <Json value={a.patch} />
                            </div>
                            <div>
                                <div className="font-medium">
                                    <Trans>Resulting</Trans>
                                </div>
                                <Json value={a.resultingPayload} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
