import * as React from 'react';
import { StatusBadge, ViewToggle } from './ExtractTestResults';
import type { TestResult } from './step-test-handlers';

export interface TestResultContainerProps {
    result: TestResult;
    children: React.ReactNode;
    showViewToggle?: boolean;
    resultView?: 'table' | 'json';
    onViewChange?: (view: 'table' | 'json') => void;
}

/**
 * Shared container for test result displays.
 * Consistent layout with status badge, message, and optional view toggle.
 *
 * Used by: ExtractTestResults, TransformTestResults, LoadTestResults,
 * FeedTestResults, ValidateTestResults, GenericTestResults
 */
export function TestResultContainer({
    result,
    children,
    showViewToggle = false,
    resultView = 'table',
    onViewChange,
}: TestResultContainerProps) {
    return (
        <div className="space-y-3 pt-3 border-t">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <StatusBadge status={result.status} />
                    {result.message && (
                        <span className="text-sm text-muted-foreground">{result.message}</span>
                    )}
                </div>
                {showViewToggle && onViewChange && (
                    <ViewToggle resultView={resultView} onViewChange={onViewChange} />
                )}
            </div>
            {children}
        </div>
    );
}

/**
 * JSON display component for test results
 */
export function JsonDisplay({ data, maxHeight = '300px' }: { data: unknown; maxHeight?: string }) {
    return (
        <pre
            className="text-xs bg-muted p-3 rounded overflow-auto"
            style={{ maxHeight }}
        >
            {JSON.stringify(data, null, 2)}
        </pre>
    );
}
