import * as React from 'react';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@vendure/dashboard';
import { toast } from 'sonner';
import { useDryRunPipeline } from '../../../hooks';
import type { DryRunResult, DryRunMetrics, PipelineDefinition } from '../../../types';
import { formatDiffValue } from '../../../utils/formatters';
import { DIFF_TYPE, DIALOG_DIMENSIONS, SCROLL_HEIGHTS, TOAST_PIPELINE } from '../../../constants';

export interface DryRunDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    pipelineId: string | undefined;
    definition: PipelineDefinition | undefined;
}

export function DryRunDialog({
    open,
    onOpenChange,
    pipelineId,
}: DryRunDialogProps) {
    const dryRun = useDryRunPipeline(pipelineId);
    const [hasAttempted, setHasAttempted] = React.useState(false);
    const [dryRunTab, setDryRunTab] = React.useState<'summary' | 'diff' | 'simulation'>('summary');

    const dryRunResult: DryRunResult | null = React.useMemo(() => {
        if (!dryRun.data) return null;
        const result = dryRun.data;
        return {
            metrics: (result as Record<string, unknown>).metrics,
            notes: ((result as Record<string, unknown>).notes as string[] | undefined) ?? [],
            sampleRecords: ((result as Record<string, unknown>).sampleRecords as DryRunResult['sampleRecords']) ?? undefined,
        };
    }, [dryRun.data]);

    const dryRunError = dryRun.error instanceof Error ? dryRun.error.message : dryRun.error ? 'Unknown error' : null;

    const handleDryRun = React.useCallback(() => {
        if (!pipelineId) return;
        setHasAttempted(true);
        dryRun.mutate(undefined, {
            onError: (err) => {
                const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                toast.error(TOAST_PIPELINE.DRY_RUN_FAILED, { description: errorMessage });
            },
        });
    }, [pipelineId, dryRun]);

    // Run dry run when dialog opens (only once)
    React.useEffect(() => {
        if (open && pipelineId && !hasAttempted && !dryRun.isPending) {
            handleDryRun();
        }
    }, [open, pipelineId, hasAttempted, dryRun.isPending, handleDryRun]);

    // Reset state when dialog closes
    React.useEffect(() => {
        if (!open) {
            dryRun.reset();
            setHasAttempted(false);
            setDryRunTab('summary');
        }
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={`${DIALOG_DIMENSIONS.MAX_WIDTH_4XL} ${DIALOG_DIMENSIONS.MAX_HEIGHT_85VH} overflow-hidden flex flex-col`} data-testid="dry-run-dialog">
                <DialogHeader>
                    <DialogTitle>Dry Run</DialogTitle>
                    <DialogDescription>
                        {dryRun.isPending ? 'Running dry run...' : 'Preview pipeline execution without making changes'}
                    </DialogDescription>
                </DialogHeader>
                <Tabs value={dryRunTab} onValueChange={v => setDryRunTab(v as typeof dryRunTab)} className="flex-1 overflow-hidden flex flex-col">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="summary" data-testid="datahub-dryrun-tab-summary">Summary</TabsTrigger>
                        <TabsTrigger value="diff" data-testid="datahub-dryrun-tab-diff">Record Diff</TabsTrigger>
                        <TabsTrigger value="simulation" data-testid="datahub-dryrun-tab-simulation">Simulate</TabsTrigger>
                    </TabsList>
                    <div className="flex-1 overflow-auto mt-4">
                        <TabsContent value="summary" className="mt-0">
                            {dryRun.isPending ? (
                                <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                                    <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                                    <span>Running dry run...</span>
                                </div>
                            ) : dryRunError ? (
                                <div className="py-6">
                                    <div className="border rounded-md p-4 bg-red-50 border-red-200">
                                        <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0 mt-0.5">
                                                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="text-sm font-medium text-red-800">Dry Run Failed</h3>
                                                <p className="mt-1 text-sm text-red-700">{dryRunError}</p>
                                                <p className="mt-3 text-xs text-red-600">
                                                    Please fix the validation issues in your pipeline configuration and try again.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex justify-center">
                                        <Button variant="outline" size="sm" onClick={handleDryRun} data-testid="datahub-dryrun-retry-btn">
                                            Retry Dry Run
                                        </Button>
                                    </div>
                                </div>
                            ) : dryRunResult ? (
                                <div className="space-y-4">
                                    <DryRunMetricsSummary metrics={dryRunResult.metrics} />
                                    <DryRunStepDetails metrics={dryRunResult.metrics} />
                                    {dryRunResult.notes?.length ? (
                                        <div className="space-y-2">
                                            {dryRunResult.notes.filter(n => n.startsWith('Error:')).length > 0 && (
                                                <div className="border rounded-md p-3 bg-red-50 border-red-200">
                                                    <div className="text-sm font-medium text-red-800 mb-1">Errors</div>
                                                    <ul className="list-disc pl-5 text-sm text-red-700">
                                                        {/* Static display list, using content-based key */}
                                                        {dryRunResult.notes.filter(n => n.startsWith('Error:')).map((n) => (
                                                            <li key={`error-${n.slice(0, 50)}`}>{n.replace('Error: ', '')}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {dryRunResult.notes.filter(n => !n.startsWith('Error:')).length > 0 && (
                                                <div className="border rounded-md p-3 bg-amber-50 border-amber-200">
                                                    <div className="text-sm font-medium text-amber-800 mb-1">Notes</div>
                                                    <ul className="list-disc pl-5 text-sm text-amber-700">
                                                        {/* Static display list, using content-based key */}
                                                        {dryRunResult.notes.filter(n => !n.startsWith('Error:')).map((n) => (
                                                            <li key={`note-${n.slice(0, 50)}`}>{n}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="text-muted-foreground py-8 text-center">
                                    No results yet. Click "Run dry run" below to execute.
                                </div>
                            )}
                        </TabsContent>
                        <TabsContent value="diff" className="mt-0">
                            {dryRunResult?.sampleRecords?.length ? (
                                <div className="space-y-4">
                                    {dryRunResult.sampleRecords.map((rec, i) => (
                                        <RecordDiffView key={`${rec.step}-${i}`} before={rec.before} after={rec.after} step={rec.step} />
                                    ))}
                                </div>
                            ) : (
                                <div className="text-muted-foreground py-8 text-center">
                                    <div className="mb-2">No record diffs available.</div>
                                    <div className="text-xs">Run with sample data in the Simulate tab to see transformations.</div>
                                </div>
                            )}
                        </TabsContent>
                        <TabsContent value="simulation" className="mt-0">
                            <div className="space-y-4">
                                <div className="border rounded-md p-4 bg-muted/30">
                                    <div className="text-sm font-medium mb-2">How Dry Run Works</div>
                                    <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                                        <li>Extracts real data from your configured source</li>
                                        <li>Runs all transform operations on the data</li>
                                        <li>Simulates loader operations without writing to database</li>
                                        <li>Shows before/after samples in the "Record Diff" tab</li>
                                    </ul>
                                </div>
                                <div>
                                    <div className="text-sm font-medium mb-2">Test Individual Steps</div>
                                    <div className="text-sm text-muted-foreground mb-3">
                                        Use the Step Tester in the pipeline editor to test individual extract, transform, or load steps with custom sample data.
                                    </div>
                                </div>
                                <Button
                                    onClick={() => {
                                        handleDryRun();
                                        setDryRunTab('diff');
                                    }}
                                    disabled={dryRun.isPending}
                                >
                                    {dryRun.isPending ? 'Running...' : 'Run Dry Run & View Diff'}
                                </Button>
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>
                <div className="flex items-center justify-between pt-4 border-t">
                    <div className="text-xs text-muted-foreground">
                        Dry run does not persist any changes to the database
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                        <Button onClick={handleDryRun} disabled={dryRun.isPending}>
                            {dryRun.isPending ? 'Running...' : 'Run Dry Run'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function DryRunMetricsSummary({ metrics }: Readonly<{ metrics: unknown }>) {
    const dryRunMetrics = (metrics ?? {}) as DryRunMetrics;
    const cards = [
        { label: 'Processed', value: dryRunMetrics.recordsProcessed ?? 0, color: 'text-blue-600' },
        { label: 'Succeeded', value: dryRunMetrics.recordsSucceeded ?? 0, color: 'text-green-600' },
        { label: 'Failed', value: dryRunMetrics.recordsFailed ?? 0, color: 'text-red-600' },
        { label: 'Skipped', value: dryRunMetrics.recordsSkipped ?? 0, color: 'text-amber-600' },
    ];

    return (
        <div className="grid grid-cols-4 gap-4">
            {cards.map(card => (
                <div key={card.label} className="border rounded-md p-3 text-center">
                    <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                    <div className="text-xs text-muted-foreground">{card.label}</div>
                </div>
            ))}
        </div>
    );
}

function DryRunStepDetails({ metrics }: Readonly<{ metrics: unknown }>) {
    const metricsData = (metrics ?? {}) as DryRunMetrics;
    const details = metricsData.details ?? [];

    if (details.length === 0) {
        return null;
    }

    return (
        <div className="border rounded-md overflow-hidden">
            <div className="bg-muted px-3 py-2 text-sm font-medium">Step Execution Details</div>
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b bg-muted/50">
                        <th className="text-left px-3 py-2">Step</th>
                        <th className="text-left px-3 py-2">Adapter</th>
                        <th className="text-right px-3 py-2">In</th>
                        <th className="text-right px-3 py-2">Out</th>
                        <th className="text-right px-3 py-2">Duration</th>
                    </tr>
                </thead>
                <tbody>
                    {details.map(d => (
                        <tr key={d.stepKey} className="border-b last:border-b-0 hover:bg-muted/30">
                            <td className="px-3 py-2 font-mono text-xs">{d.stepKey}</td>
                            <td className="px-3 py-2 text-muted-foreground">{d.adapterCode ?? '-'}</td>
                            <td className="px-3 py-2 text-right">{d.recordsIn ?? 0}</td>
                            <td className="px-3 py-2 text-right">{d.recordsOut ?? 0}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                                {d.durationMs != null ? `${d.durationMs}ms` : '-'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function RecordDiffView({ before, after, step }: Readonly<{
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    step: string;
}>) {
    const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
    const changes: Array<{ key: string; type: typeof DIFF_TYPE[keyof typeof DIFF_TYPE]; oldValue?: unknown; newValue?: unknown }> = [];

    for (const key of allKeys) {
        const hasOld = Object.prototype.hasOwnProperty.call(before, key);
        const hasNew = Object.prototype.hasOwnProperty.call(after, key);
        const oldVal = before[key];
        const newVal = after[key];

        if (!hasOld && hasNew) {
            changes.push({ key, type: DIFF_TYPE.ADDED, newValue: newVal });
        } else if (hasOld && !hasNew) {
            changes.push({ key, type: DIFF_TYPE.REMOVED, oldValue: oldVal });
        } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            changes.push({ key, type: DIFF_TYPE.CHANGED, oldValue: oldVal, newValue: newVal });
        } else {
            changes.push({ key, type: DIFF_TYPE.UNCHANGED, oldValue: oldVal, newValue: newVal });
        }
    }

    const changedCount = changes.filter(c => c.type !== DIFF_TYPE.UNCHANGED).length;

    return (
        <div className="border rounded-md overflow-hidden">
            <div className="bg-muted px-3 py-2 flex items-center justify-between">
                <span className="text-sm font-medium">Step: {step}</span>
                <span className="text-xs text-muted-foreground">
                    {changedCount} change{changedCount !== 1 ? 's' : ''}
                </span>
            </div>
            <div className={`divide-y divide-border ${SCROLL_HEIGHTS.DRY_RUN_RESULTS} overflow-auto bg-card`}>
                {changes.map(c => (
                    <div
                        key={c.key}
                        className={`px-3 py-2 text-sm grid grid-cols-3 gap-2 ${
                            c.type === DIFF_TYPE.ADDED ? 'bg-green-500/10 dark:bg-green-500/20' :
                            c.type === DIFF_TYPE.REMOVED ? 'bg-red-500/10 dark:bg-red-500/20' :
                            c.type === DIFF_TYPE.CHANGED ? 'bg-amber-500/10 dark:bg-amber-500/20' : 'bg-card'
                        }`}
                    >
                        <div className="font-mono text-xs flex items-center gap-2 text-foreground">
                            {c.type === DIFF_TYPE.ADDED && <span className="text-green-600 dark:text-green-400">+</span>}
                            {c.type === DIFF_TYPE.REMOVED && <span className="text-red-600 dark:text-red-400">-</span>}
                            {c.type === DIFF_TYPE.CHANGED && <span className="text-amber-600 dark:text-amber-400">~</span>}
                            {c.type === DIFF_TYPE.UNCHANGED && <span className="text-muted-foreground">=</span>}
                            <span>{c.key}</span>
                        </div>
                        <div className="text-muted-foreground truncate" title={JSON.stringify(c.oldValue)}>
                            {c.type !== DIFF_TYPE.ADDED ? formatDiffValue(c.oldValue) : '-'}
                        </div>
                        <div className={`truncate text-foreground ${c.type === DIFF_TYPE.CHANGED || c.type === DIFF_TYPE.ADDED ? 'font-medium' : ''}`} title={JSON.stringify(c.newValue)}>
                            {c.type !== DIFF_TYPE.REMOVED ? formatDiffValue(c.newValue) : '-'}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
