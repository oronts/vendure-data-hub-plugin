import * as React from 'react';
import { Json } from '@vendure/dashboard';
import { useErrorAudits } from '../../hooks';

export function ErrorAuditList({ errorId }: { errorId: string }) {
    const { data: audits, isFetching } = useErrorAudits(errorId);

    if (!audits?.length) return null;

    return (
        <div className="mt-2 border rounded p-2">
            <div className="text-xs font-medium mb-1">Retry audit trail</div>
            <div className="space-y-2">
                {audits.map(a => (
                    <div key={a.id} className="text-xs">
                        <div className="text-muted-foreground">
                            {new Date(String(a.createdAt)).toLocaleString()} · user {a.userId ?? '—'}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <div className="font-medium">Previous</div>
                                <Json value={a.previousPayload} />
                            </div>
                            <div>
                                <div className="font-medium">Patch</div>
                                <Json value={a.patch} />
                            </div>
                            <div>
                                <div className="font-medium">Resulting</div>
                                <Json value={a.resultingPayload} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
