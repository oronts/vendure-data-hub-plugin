import { describe, expect, it } from 'vitest';
import {
    DryRunMessageCode,
    DryRunMessageLevel,
} from '../../constants';
import type { PipelineDefinition } from '../../types';
import { buildDryRunMessages } from './dry-run-messages';

const definition: PipelineDefinition = {
    version: 1,
    steps: [
        { key: 'load', type: 'LOAD', config: { adapterCode: 'product' } },
        { key: 'extract', type: 'EXTRACT', config: { adapterCode: 'http' } },
    ],
};

describe('buildDryRunMessages', () => {
    it('returns stable codes and values without encoding severity in prose', () => {
        const messages = buildDryRunMessages(definition, {
            totalRecords: 2,
            details: [{
                stepKey: 'load',
                stepType: 'LOAD',
                simulation: 'SKIPPED',
            }],
        }, [{ stepKey: 'load', message: 'SKU is invalid' }]);

        expect(messages).toEqual([
            {
                level: DryRunMessageLevel.INFO,
                code: DryRunMessageCode.COMPLETED,
            },
            {
                level: DryRunMessageLevel.INFO,
                code: DryRunMessageCode.PROCESSED_RECORDS,
                values: { count: 2 },
            },
            {
                level: DryRunMessageLevel.ERROR,
                code: DryRunMessageCode.RECORD_ERROR,
                detail: 'SKU is invalid',
                stepKey: 'load',
            },
            {
                level: DryRunMessageLevel.WARNING,
                code: DryRunMessageCode.STEP_SIMULATION_SKIPPED,
                stepKey: 'load',
                values: { stepType: 'LOAD' },
            },
        ]);
    });

    it('finds the extract adapter in graph definitions whose steps are unordered', () => {
        const messages = buildDryRunMessages(definition, { totalRecords: 0 });

        expect(messages).toContainEqual({
            level: DryRunMessageLevel.INFO,
            code: DryRunMessageCode.EXTRACT_ADAPTER,
            stepKey: 'extract',
            values: { adapterCode: 'http' },
        });
    });
});
