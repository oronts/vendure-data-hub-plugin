import * as React from 'react';
import { formatKey, formatValue } from '../../../utils/Formatters';
import { TestResultContainer, JsonDisplay } from './TestResultContainer';
import type { TestResult } from './StepTestHandlers';

interface LoadTestResultsProps {
    result: TestResult;
}

interface FeedPreviewProps {
    feedContent: { content: string; contentType: string; itemCount: number };
}

/**
 * Display component for LOAD step simulation results
 */
export function LoadSimulationResult({
    simulation,
}: {
    simulation: Record<string, unknown>;
}) {
    const entries = Object.entries(simulation);

    if (!entries.length) {
        return <div className="text-muted-foreground text-sm">No simulation data returned</div>;
    }

    return (
        <div className="space-y-2">
            {entries.map(([key, value]) => (
                <div key={key} className="flex items-center justify-between border rounded p-2">
                    <span className="text-sm font-medium">{formatKey(key)}</span>
                    <span className="text-sm font-mono">{formatValue(value)}</span>
                </div>
            ))}
        </div>
    );
}

/**
 * Display component for FEED step preview results
 */
export function FeedPreview({ feedContent }: FeedPreviewProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-4 text-sm">
                <span>
                    <strong>Items:</strong> {feedContent.itemCount}
                </span>
                <span>
                    <strong>Type:</strong> {feedContent.contentType}
                </span>
            </div>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[300px] whitespace-pre-wrap">
                {feedContent.content || '(empty)'}
            </pre>
        </div>
    );
}

/**
 * Display component for LOAD step test results
 */
export function LoadTestResults({ result }: LoadTestResultsProps) {
    if (!result.loadSimulation) {
        return null;
    }

    return (
        <TestResultContainer result={result}>
            <LoadSimulationResult simulation={result.loadSimulation} />
        </TestResultContainer>
    );
}

/**
 * Display component for FEED step test results
 */
export function FeedTestResults({ result }: LoadTestResultsProps) {
    if (!result.feedContent) {
        return null;
    }

    return (
        <TestResultContainer result={result}>
            <FeedPreview feedContent={result.feedContent} />
        </TestResultContainer>
    );
}

/**
 * Generic result display for steps that only show data/message
 * Used for TRIGGER, EXPORT, SINK, and unknown step types
 */
export function GenericTestResults({ result }: LoadTestResultsProps) {
    return (
        <TestResultContainer result={result}>
            {result.data && (
                <JsonDisplay data={result.data} maxHeight="200px" />
            )}
        </TestResultContainer>
    );
}
