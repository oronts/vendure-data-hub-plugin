import * as React from 'react';
import { Trans } from '@lingui/react/macro';
import type { IndividualRunMetrics, StepMetricsDetail } from '../../types';

export function StepSummaryTable({ metrics }: { metrics: IndividualRunMetrics }) {
    const details: StepMetricsDetail[] = Array.isArray(metrics?.details) ? metrics.details : [];
    if (!details.length) return null;

    return (
        <div className="mt-2">
            <div className="text-sm font-medium mb-1">
                <Trans>Step summary</Trans>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <caption className="sr-only"><Trans>Pipeline step execution summary</Trans></caption>
                <thead>
                    <tr className="bg-muted">
                        <th scope="col" className="text-left px-2 py-1">
                            <Trans>Step</Trans>
                        </th>
                        <th scope="col" className="text-left px-2 py-1">
                            <Trans>Type</Trans>
                        </th>
                        <th scope="col" className="text-left px-2 py-1">
                            <Trans>Adapter</Trans>
                        </th>
                        <th scope="col" className="text-left px-2 py-1">
                            <Trans>OK / Skipped / Failed</Trans>
                        </th>
                        <th scope="col" className="text-left px-2 py-1">
                            <Trans>Duration</Trans>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {details.map((s, i) => (
                        <tr key={s.stepKey ?? `step-${i}`} className="border-t">
                            <td className="px-2 py-1 font-mono text-muted-foreground">{s.stepKey}</td>
                            <td className="px-2 py-1">{s.type}</td>
                            <td className="px-2 py-1">{s.adapterCode ?? '—'}</td>
                            <td className="px-2 py-1">
                                {s.ok ?? 0} / {s.skipped ?? 0} / {s.fail ?? 0}
                            </td>
                            <td className="px-2 py-1">{typeof s.durationMs === 'number' ? `${s.durationMs} ms` : '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            </div>
        </div>
    );
}
