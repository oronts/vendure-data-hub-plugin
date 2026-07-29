import { describe, expect, it, vi } from 'vitest';
import { DataHubDryRunMessageLevel } from '../../../gql/graphql';
import { formatDryRunMessage } from './dry-run-message-format';

const formatter = {
    noRecords: vi.fn(() => 'no-records'),
    extractAdapter: vi.fn((adapterCode: string) => `adapter:${adapterCode}`),
    completed: vi.fn(() => 'completed'),
    processedRecords: vi.fn((count: number) => `processed:${count}`),
    recordError: vi.fn((stepKey: string, detail: string) => `${stepKey}:${detail}`),
    stepSimulationSkipped: vi.fn((stepKey: string, stepType: string) => `${stepKey}:${stepType}`),
};

describe('formatDryRunMessage', () => {
    it('formats known codes through the provided source-text formatter', () => {
        const formatted = formatDryRunMessage({
            code: 'PROCESSED_RECORDS',
            level: DataHubDryRunMessageLevel.INFO,
            values: { count: 2 },
        }, formatter);

        expect(formatted).toBe('processed:2');
    });

    it('preserves raw details for unknown extension codes', () => {
        const formatted = formatDryRunMessage({
            code: 'CUSTOM_CONNECTOR_NOTICE',
            detail: 'Custom connector detail',
            level: DataHubDryRunMessageLevel.WARNING,
        }, formatter);

        expect(formatted).toBe('Custom connector detail');
    });
});
