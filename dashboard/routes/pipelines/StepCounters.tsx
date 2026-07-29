import * as React from 'react';
import { Trans } from '@lingui/react/macro';
import type { IndividualRunMetrics, StepMetricsDetail } from '../../types';

export function StepCounters({ metrics }: { metrics: IndividualRunMetrics }) {
    const details: StepMetricsDetail[] = Array.isArray(metrics?.details) ? metrics.details : [];
    const countersObj = details.find(x => x && typeof x === 'object' && x.counters);
    if (!countersObj?.counters) return null;

    return (
        <div className="mt-2">
            <div className="text-sm font-medium mb-1">
                <Trans>Counters</Trans>
            </div>
            <table className="text-sm">
                <tbody>
                    {Object.entries(countersObj.counters).map(([k, v]) => (
                        <tr key={k}>
                            <th scope="row" className="pr-3 text-left font-normal text-muted-foreground">{k}</th>
                            <td>{String(v)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
