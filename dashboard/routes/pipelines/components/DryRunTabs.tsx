import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@vendure/dashboard';
import { DIFF_TYPE, SCROLL_HEIGHTS } from '../../../constants';
import type { DryRunResult } from '../../../types';
import { formatDiffValue } from '../../../utils';
import { DryRunSummary } from './DryRunSummary';
import { buildRecordChanges } from './dry-run-record-changes';
import type { RecordChange } from './dry-run-record-changes';

export type DryRunTab = 'summary' | 'diff' | 'simulation';

interface DryRunTabsProps {
    tab: DryRunTab;
    onTabChange: (tab: DryRunTab) => void;
    isPending: boolean;
    error: string | null;
    result: DryRunResult | null;
    onRun: () => void;
}

export function DryRunTabs({
    tab,
    onTabChange,
    isPending,
    error,
    result,
    onRun,
}: Readonly<DryRunTabsProps>) {
    return (
        <Tabs value={tab} onValueChange={value => onTabChange(value as DryRunTab)} className="flex-1 overflow-hidden flex flex-col">
            <DryRunTabList />
            <div className="flex-1 overflow-auto mt-4">
                <TabsContent value="summary" className="mt-0">
                    <DryRunSummary
                        isPending={isPending}
                        error={error}
                        result={result}
                        onRetry={onRun}
                    />
                </TabsContent>
                <TabsContent value="diff" className="mt-0">
                    <DryRunDiff result={result} />
                </TabsContent>
                <TabsContent value="simulation" className="mt-0">
                    <DryRunSimulation
                        isPending={isPending}
                        onRun={() => {
                            onRun();
                            onTabChange('diff');
                        }}
                    />
                </TabsContent>
            </div>
        </Tabs>
    );
}

function DryRunTabList() {
    return (
        <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="summary" data-testid="datahub-dryrun-tab-summary">
                <Trans>Summary</Trans>
            </TabsTrigger>
            <TabsTrigger value="diff" data-testid="datahub-dryrun-tab-diff">
                <Trans>Record diff</Trans>
            </TabsTrigger>
            <TabsTrigger value="simulation" data-testid="datahub-dryrun-tab-simulation">
                <Trans>Simulate</Trans>
            </TabsTrigger>
        </TabsList>
    );
}

function DryRunDiff({ result }: Readonly<{ result: DryRunResult | null }>) {
    const records = result?.sampleRecords ?? [];
    if (records.length === 0) {
        return (
            <div className="text-muted-foreground py-8 text-center">
                <div className="mb-2">
                    <Trans>No record diffs available.</Trans>
                </div>
                <div className="text-xs">
                    <Trans>Run with sample data in the Simulate tab to see transformations.</Trans>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {records.map((record, index) => (
                <RecordDiffView
                    key={`${record.step}-${index}`}
                    before={record.before}
                    after={record.after}
                    step={record.step}
                />
            ))}
        </div>
    );
}

function DryRunSimulation({ isPending, onRun }: Readonly<{ isPending: boolean; onRun: () => void }>) {
    return (
        <div className="space-y-4">
            <div className="border rounded-md p-4 bg-muted/30">
                <div className="text-sm font-medium mb-2">
                    <Trans>How dry run works</Trans>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                    <li><Trans>Extracts real data from your configured source</Trans></li>
                    <li><Trans>Runs all transform operations on the data</Trans></li>
                    <li><Trans>Simulates loader operations without writing to the database</Trans></li>
                    <li><Trans>Shows before and after samples in the Record diff tab</Trans></li>
                </ul>
            </div>
            <div>
                <div className="text-sm font-medium mb-2">
                    <Trans>Test individual steps</Trans>
                </div>
                <div className="text-sm text-muted-foreground mb-3">
                    <Trans>Use the Step Tester in the pipeline editor to test individual extract, transform, or load steps with custom sample data.</Trans>
                </div>
            </div>
            <Button onClick={onRun} disabled={isPending}>
                {isPending
                    ? <Trans>Running...</Trans>
                    : <Trans>Run dry run and view diff</Trans>}
            </Button>
        </div>
    );
}

export function DryRunDialogFooter({
    isPending,
    onRun,
    onClose,
}: Readonly<{ isPending: boolean; onRun: () => void; onClose: () => void }>) {
    return (
        <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-xs text-muted-foreground">
                <Trans>Dry run does not persist changes to the database</Trans>
            </div>
            <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onClose}>
                    <Trans>Close</Trans>
                </Button>
                <Button onClick={onRun} disabled={isPending}>
                    {isPending
                        ? <Trans>Running...</Trans>
                        : <Trans>Run dry run</Trans>}
                </Button>
            </div>
        </div>
    );
}

function RecordDiffView({ before, after, step }: Readonly<{
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    step: string;
}>) {
    const { t } = useLingui();
    const changes = buildRecordChanges(before, after);
    const changedCount = changes.filter(change => change.type !== DIFF_TYPE.UNCHANGED).length;
    const changeCountLabel = changedCount === 1
        ? t`${changedCount} change`
        : t`${changedCount} changes`;

    return (
        <div className="border rounded-md overflow-hidden">
            <div className="bg-muted px-3 py-2 flex items-center justify-between">
                <span className="text-sm font-medium">
                    <Trans>Step: {step}</Trans>
                </span>
                <span className="text-xs text-muted-foreground">
                    {changeCountLabel}
                </span>
            </div>
            <div className={`divide-y divide-border ${SCROLL_HEIGHTS.DRY_RUN_RESULTS} overflow-auto bg-card`}>
                {changes.map(change => <RecordChangeRow key={change.key} change={change} />)}
            </div>
        </div>
    );
}

function RecordChangeRow({ change }: Readonly<{ change: RecordChange }>) {
    const style = change.type === DIFF_TYPE.ADDED
        ? 'bg-green-500/10 dark:bg-green-500/20'
        : change.type === DIFF_TYPE.REMOVED
            ? 'bg-red-500/10 dark:bg-red-500/20'
            : change.type === DIFF_TYPE.CHANGED
                ? 'bg-amber-500/10 dark:bg-amber-500/20'
                : 'bg-card';
    return (
        <div className={`px-3 py-2 text-sm grid grid-cols-3 gap-2 ${style}`}>
            <div className="font-mono text-xs flex items-center gap-2 text-foreground">
                <DiffMarker type={change.type} />
                <span>{change.key}</span>
            </div>
            <div className="text-muted-foreground truncate" title={JSON.stringify(change.oldValue)}>
                {change.type !== DIFF_TYPE.ADDED ? formatDiffValue(change.oldValue) : '-'}
            </div>
            <div className={`truncate text-foreground ${change.type === DIFF_TYPE.CHANGED || change.type === DIFF_TYPE.ADDED ? 'font-medium' : ''}`} title={JSON.stringify(change.newValue)}>
                {change.type !== DIFF_TYPE.REMOVED ? formatDiffValue(change.newValue) : '-'}
            </div>
        </div>
    );
}

function DiffMarker({ type }: Readonly<{ type: RecordChange['type'] }>) {
    if (type === DIFF_TYPE.ADDED) {
        return <span className="text-green-600 dark:text-green-400">+</span>;
    }
    if (type === DIFF_TYPE.REMOVED) {
        return <span className="text-red-600 dark:text-red-400">-</span>;
    }
    if (type === DIFF_TYPE.CHANGED) {
        return <span className="text-amber-600 dark:text-amber-400">~</span>;
    }
    return <span className="text-muted-foreground">=</span>;
}
