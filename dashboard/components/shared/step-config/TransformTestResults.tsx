import * as React from 'react';
import { memo } from 'react';
import { RecordsTable } from './ExtractTestResults';
import { TestResultContainer, JsonDisplay } from './TestResultContainer';
import { UI_LIMITS } from '../../../constants';
import type { TestResult } from './step-test-handlers';

interface TransformTestResultsProps {
    result: TestResult;
    resultView: 'table' | 'json';
    onViewChange: (view: 'table' | 'json') => void;
}

/**
 * Before/After diff display for transform operations
 */
const BeforeAfterDiff = memo(function BeforeAfterDiff({
    beforeAfter,
}: {
    beforeAfter: Array<{ before: Record<string, unknown>; after: Record<string, unknown> }>;
}) {
    return (
        <div className="space-y-3">
            {/* Index as key acceptable - static test result data, not reordered */}
            {beforeAfter.slice(0, UI_LIMITS.DIFF_PREVIEW_RECORDS).map((pair, recordIndex) => (
                <div key={`record-${recordIndex}`} className="border rounded overflow-hidden">
                    <div className="bg-muted/50 px-2 py-1 text-xs font-medium">
                        Record {recordIndex + 1}
                    </div>
                    <div className="grid grid-cols-2 divide-x">
                        <div className="p-2">
                            <div className="text-xs text-muted-foreground mb-1">Before</div>
                            <pre className="text-[10px] bg-red-50 dark:bg-red-950/30 p-2 rounded overflow-auto max-h-[120px]">
                                {JSON.stringify(pair.before, null, 2)}
                            </pre>
                        </div>
                        <div className="p-2">
                            <div className="text-xs text-muted-foreground mb-1">After</div>
                            <pre className="text-[10px] bg-green-50 dark:bg-green-950/30 p-2 rounded overflow-auto max-h-[120px]">
                                {JSON.stringify(pair.after, null, 2)}
                            </pre>
                        </div>
                    </div>
                </div>
            ))}
            {beforeAfter.length > UI_LIMITS.DIFF_PREVIEW_RECORDS && (
                <div className="text-xs text-muted-foreground">
                    Showing {UI_LIMITS.DIFF_PREVIEW_RECORDS} of {beforeAfter.length} records
                </div>
            )}
        </div>
    );
});

/**
 * Display component for TRANSFORM step test results
 * Shows before/after comparison of transformed records
 */
export const TransformTestResults = memo(function TransformTestResults({
    result,
    resultView,
    onViewChange,
}: TransformTestResultsProps) {
    if (!result.beforeAfter) {
        // Fallback to records view if no beforeAfter data
        if (result.records) {
            return (
                <TestResultContainer
                    result={result}
                    showViewToggle
                    resultView={resultView}
                    onViewChange={onViewChange}
                >
                    {resultView === 'table' ? (
                        <RecordsTable records={result.records} />
                    ) : (
                        <JsonDisplay data={result.records} />
                    )}
                </TestResultContainer>
            );
        }
        return null;
    }

    return (
        <TestResultContainer
            result={result}
            showViewToggle
            resultView={resultView}
            onViewChange={onViewChange}
        >
            {resultView === 'table' ? (
                <BeforeAfterDiff beforeAfter={result.beforeAfter} />
            ) : (
                <JsonDisplay data={result.beforeAfter} />
            )}
        </TestResultContainer>
    );
});

/**
 * Display component for VALIDATE step test results
 * Shows validation results with optional summary data
 */
export const ValidateTestResults = memo(function ValidateTestResults({
    result,
    resultView,
    onViewChange,
}: TransformTestResultsProps) {
    return (
        <TestResultContainer
            result={result}
            showViewToggle={!!result.records}
            resultView={resultView}
            onViewChange={onViewChange}
        >
            {result.records && (
                resultView === 'table' ? (
                    <RecordsTable records={result.records} />
                ) : (
                    <JsonDisplay data={result.records} />
                )
            )}

            {result.data && (
                <JsonDisplay data={result.data} maxHeight="200px" />
            )}
        </TestResultContainer>
    );
});
