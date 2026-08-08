import * as React from 'react';
import { Trans } from '@lingui/react/macro';
import { formatKey, formatValue } from '../../../utils';
import { TestResultContainer, JsonDisplay } from './TestResultContainer';
import type { TestResult } from './step-test-handlers';

interface LoadTestResultsProps {
    result: TestResult;
}

/**
 * Display component for LOAD step simulation results
 */
function LoadSimulationResult({
    simulation,
}: {
    simulation: Record<string, unknown>;
}) {
    const entries = Object.entries(simulation);

    if (!entries.length) {
        return <div className="text-muted-foreground text-sm"><Trans>No simulation data returned</Trans></div>;
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
 * Generic result display for steps that only show data/message
 * Used for TRIGGER, EXPORT, SINK, and unknown step types
 */
export function GenericTestResults({ result }: LoadTestResultsProps) {
    return (
        <TestResultContainer result={result}>
            {result.data !== undefined && result.data !== null && (
                <JsonDisplay data={result.data} maxHeight="200px" />
            )}
        </TestResultContainer>
    );
}
