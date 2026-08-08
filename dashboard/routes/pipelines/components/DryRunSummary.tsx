import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button } from '@vendure/dashboard';
import { DataHubDryRunMessageLevel } from '../../../gql/graphql';
import type { DryRunMetrics, DryRunResult } from '../../../types';
import { formatDryRunMessage } from './dry-run-message-format';

interface DryRunSummaryProps {
    isPending: boolean;
    error: string | null;
    result: DryRunResult | null;
    onRetry: () => void;
}

export function DryRunSummary({
    isPending,
    error,
    result,
    onRetry,
}: Readonly<DryRunSummaryProps>) {
    if (isPending) {
        return <DryRunPending />;
    }
    if (error) {
        return <DryRunFailure error={error} onRetry={onRetry} />;
    }
    if (result) {
        return <DryRunResults result={result} />;
    }
    return <DryRunEmpty />;
}

function DryRunPending() {
    return (
        <div
            className="flex items-center gap-2 text-muted-foreground py-8 justify-center"
            role="status"
            aria-live="polite"
        >
            <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
            <span><Trans>Running dry run...</Trans></span>
        </div>
    );
}

function DryRunFailure({ error, onRetry }: Readonly<{ error: string; onRetry: () => void }>) {
    return (
        <div className="py-6">
            <div className="border rounded-md p-4 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                        <svg aria-hidden="true" className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-sm font-medium text-red-800 dark:text-red-400">
                            <Trans>Dry run failed</Trans>
                        </h3>
                        <p className="mt-1 text-sm text-red-700 dark:text-red-400">{error}</p>
                        <p className="mt-3 text-xs text-red-600 dark:text-red-400">
                            <Trans>Fix the validation issues in your pipeline configuration and try again.</Trans>
                        </p>
                    </div>
                </div>
            </div>
            <div className="mt-4 flex justify-center">
                <Button variant="outline" size="sm" onClick={onRetry} data-testid="datahub-dryrun-retry-btn">
                    <Trans>Retry dry run</Trans>
                </Button>
            </div>
        </div>
    );
}

function DryRunResults({ result }: Readonly<{ result: DryRunResult }>) {
    const messages = result.messages ?? [];
    const errorMessages = messages.filter(
        message => message.level === DataHubDryRunMessageLevel.ERROR,
    );
    const noticeMessages = messages.filter(
        message => message.level !== DataHubDryRunMessageLevel.ERROR,
    );

    return (
        <div className="space-y-4">
            <DryRunMetricsSummary metrics={result.metrics} />
            <DryRunStepDetails metrics={result.metrics} />
            {messages.length > 0 && (
                <div className="space-y-2">
                    {errorMessages.length > 0 && (
                        <DryRunMessages messages={errorMessages} level="error" />
                    )}
                    {noticeMessages.length > 0 && (
                        <DryRunMessages messages={noticeMessages} level="notice" />
                    )}
                </div>
            )}
        </div>
    );
}

type DryRunMessage = NonNullable<DryRunResult['messages']>[number];

function DryRunMessages({
    messages,
    level,
}: Readonly<{ messages: readonly DryRunMessage[]; level: 'error' | 'notice' }>) {
    const { t } = useLingui();
    const formatter = React.useMemo(() => ({
        noRecords: () => t`No records were extracted. Check that your extract step has data available.`,
        extractAdapter: (adapterCode: string) => t`Extract adapter: ${adapterCode}`,
        completed: () => t`Dry run completed successfully`,
        processedRecords: (count: number) => count === 1
            ? t`Processed ${count} record`
            : t`Processed ${count} records`,
        recordError: (stepKey: string, detail: string) => t`Step ${stepKey}: ${detail}`,
        stepSimulationSkipped: (stepKey: string, stepType: string) => (
            t`Step ${stepKey} (${stepType}) was not executed; dry run preserved its input records.`
        ),
    }), [t]);
    const error = level === 'error';
    const containerClass = error
        ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
        : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800';
    const textClass = error
        ? 'text-red-700 dark:text-red-400'
        : 'text-amber-700 dark:text-amber-400';
    const headingClass = error
        ? 'text-red-800 dark:text-red-400'
        : 'text-amber-800 dark:text-amber-400';

    return (
        <div className={`border rounded-md p-3 ${containerClass}`}>
            <div className={`text-sm font-medium mb-1 ${headingClass}`}>
                {error ? <Trans>Errors</Trans> : <Trans>Messages</Trans>}
            </div>
            <ul className={`list-disc pl-5 text-sm ${textClass}`}>
                {messages.map((message, index) => (
                    <li key={`${message.code}-${message.stepKey ?? 'global'}-${index}`}>
                        {formatDryRunMessage(message, formatter)}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function DryRunEmpty() {
    return (
        <div className="text-muted-foreground py-8 text-center">
            <Trans>No results yet. Run the dry run to execute the pipeline preview.</Trans>
        </div>
    );
}

function DryRunMetricsSummary({ metrics }: Readonly<{ metrics: unknown }>) {
    const { t } = useLingui();
    const dryRunMetrics = (metrics ?? {}) as DryRunMetrics;
    const cards = [
        { key: 'processed', label: t`Processed`, value: dryRunMetrics.recordsProcessed ?? 0, color: 'text-blue-600 dark:text-blue-400' },
        { key: 'succeeded', label: t`Succeeded`, value: dryRunMetrics.recordsSucceeded ?? 0, color: 'text-green-600 dark:text-green-400' },
        { key: 'failed', label: t`Failed`, value: dryRunMetrics.recordsFailed ?? 0, color: 'text-red-600 dark:text-red-400' },
        { key: 'skipped', label: t`Skipped`, value: dryRunMetrics.recordsSkipped ?? 0, color: 'text-amber-600 dark:text-amber-400' },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {cards.map(card => (
                <div key={card.key} className="border rounded-md p-3 text-center">
                    <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                    <div className="text-xs text-muted-foreground">{card.label}</div>
                </div>
            ))}
        </div>
    );
}

function DryRunStepDetails({ metrics }: Readonly<{ metrics: unknown }>) {
    const details = ((metrics ?? {}) as DryRunMetrics).details ?? [];
    if (details.length === 0) return null;

    return (
        <div className="border rounded-md overflow-x-auto">
            <div className="bg-muted px-3 py-2 text-sm font-medium">
                <Trans>Step execution details</Trans>
            </div>
            <table className="w-full text-sm">
                <caption className="sr-only"><Trans>Dry-run step execution details</Trans></caption>
                <thead>
                    <tr className="border-b bg-muted/50">
                        <th scope="col" className="text-left px-3 py-2"><Trans>Step</Trans></th>
                        <th scope="col" className="text-left px-3 py-2"><Trans>Adapter</Trans></th>
                        <th scope="col" className="text-right px-3 py-2"><Trans>Records in</Trans></th>
                        <th scope="col" className="text-right px-3 py-2"><Trans>Records out</Trans></th>
                        <th scope="col" className="text-right px-3 py-2"><Trans>Duration</Trans></th>
                    </tr>
                </thead>
                <tbody>
                    {details.map(detail => (
                        <tr key={detail.stepKey} className="border-b last:border-b-0 hover:bg-muted/30">
                            <td className="px-3 py-2 font-mono text-xs">{detail.stepKey}</td>
                            <td className="px-3 py-2 text-muted-foreground">{detail.adapterCode ?? '-'}</td>
                            <td className="px-3 py-2 text-right">{detail.recordsIn ?? 0}</td>
                            <td className="px-3 py-2 text-right">{detail.recordsOut ?? 0}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                                {detail.durationMs != null ? `${detail.durationMs}ms` : '-'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
