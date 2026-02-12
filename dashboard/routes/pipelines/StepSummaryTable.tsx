import * as React from 'react';
import type { IndividualRunMetrics, StepMetricsDetail } from '../../types';

export function StepSummaryTable({ metrics }: { metrics: IndividualRunMetrics }) {
    const details: StepMetricsDetail[] = Array.isArray(metrics?.details) ? metrics.details : [];
    if (!details.length) return null;

    return (
        <div className="mt-2">
            <div className="text-sm font-medium mb-1">Step summary</div>
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-muted">
                        <th className="text-left px-2 py-1">Step</th>
                        <th className="text-left px-2 py-1">Type</th>
                        <th className="text-left px-2 py-1">Adapter</th>
                        <th className="text-left px-2 py-1">Out/OK/Fail</th>
                        <th className="text-left px-2 py-1">Duration</th>
                    </tr>
                </thead>
                <tbody>
                    {/* stepKey is unique within a run, safe to use as key */}
                    {details.map((s) => (
                        <tr key={s.stepKey} className="border-t">
                            <td className="px-2 py-1 font-mono text-muted-foreground">{s.stepKey}</td>
                            <td className="px-2 py-1">{s.type}</td>
                            <td className="px-2 py-1">{s.adapterCode ?? '—'}</td>
                            <td className="px-2 py-1">{s.ok ?? 0}{typeof s.fail === 'number' ? ` / ${s.fail}` : ''}</td>
                            <td className="px-2 py-1">{typeof s.durationMs === 'number' ? `${s.durationMs} ms` : '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
