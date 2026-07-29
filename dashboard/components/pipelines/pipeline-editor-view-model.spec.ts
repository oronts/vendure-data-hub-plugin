import { describe, expect, it } from 'vitest';
import type { ValidationIssue } from '../../types';
import {
    countPipelineHooks,
    getConfiguredHookStageGroups,
    getPipelineValidationErrors,
    getStepValidationErrors,
} from './pipeline-editor-view-model';

const categories = [
    {
        key: 'lifecycle',
        label: 'Lifecycle',
        color: 'blue',
        description: 'Lifecycle hooks',
        gridClass: 'grid-cols-2',
        order: 1,
    },
    {
        key: 'data',
        label: 'Data',
        color: 'green',
        description: 'Data hooks',
        gridClass: 'grid-cols-2',
        order: 2,
    },
];

const stages = [
    {
        key: 'beforeRun',
        label: 'Before run',
        description: 'Before execution',
        icon: 'play',
        category: 'lifecycle',
    },
    {
        key: 'afterExtract',
        label: 'After extract',
        description: 'After extraction',
        icon: 'database',
        category: 'data',
    },
];

describe('pipeline editor view model', () => {
    it('counts only array-backed hook entries', () => {
        expect(countPipelineHooks({
            beforeRun: [{ type: 'LOG' }],
            afterExtract: [{ type: 'LOG' }, { type: 'EVENT' }],
            invalid: 'not-an-array',
        })).toBe(3);
    });

    it('groups only configured stages in category order', () => {
        expect(getConfiguredHookStageGroups(categories, stages, {
            afterExtract: [{ type: 'EVENT' }],
            beforeRun: [],
        })).toEqual([{
            category: categories[1],
            stages: [{ ...stages[1], hooks: [{ type: 'EVENT' }] }],
        }]);
    });

    it('separates selected-step and pipeline field errors', () => {
        const issues: ValidationIssue[] = [
            { field: 'config.url', message: 'Required', stepKey: 'extract' },
            { field: 'context.batchSize', message: 'Too large' },
            { message: 'Invalid step', stepKey: 'load' },
        ];

        expect(getStepValidationErrors(issues, 'extract')).toEqual({
            'config.url': 'Required',
        });
        expect(getPipelineValidationErrors(issues)).toEqual({
            'context.batchSize': 'Too large',
        });
    });
});
