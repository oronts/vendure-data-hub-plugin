import { describe, expect, it } from 'vitest';
import type { PipelineDefinition, PipelineStepDefinition } from '../../types';
import {
    appendSimpleStep,
    canMoveSimpleStep,
    isSimpleLinearGraph,
    moveSimpleStep,
    removeSimpleStep,
    updateSimpleStep,
} from './simple-editor-graph';

function step(key: string, type: PipelineStepDefinition['type']): PipelineStepDefinition {
    return { key, type, config: {} };
}

function definition(
    steps: PipelineStepDefinition[],
    edges: PipelineDefinition['edges'] = [],
): PipelineDefinition {
    return { version: 1, steps, edges };
}

describe('simple editor graph updates', () => {
    it('builds a connected executable chain from an empty pipeline', () => {
        const withExtract = appendSimpleStep(definition([]), step('extract', 'EXTRACT'));
        const withTransform = appendSimpleStep(withExtract, step('transform', 'TRANSFORM'));
        const withLoad = appendSimpleStep(withTransform, step('load', 'LOAD'));

        expect(withLoad.edges).toEqual([
            { from: 'extract', to: 'transform' },
            { from: 'transform', to: 'load' },
        ]);
    });

    it('connects every trigger to the first executable step', () => {
        const result = appendSimpleStep(
            definition([step('manual', 'TRIGGER'), step('schedule', 'TRIGGER')]),
            step('extract', 'EXTRACT'),
        );

        expect(result.edges).toEqual([
            { from: 'manual', to: 'extract' },
            { from: 'schedule', to: 'extract' },
        ]);
    });

    it('places a new trigger before existing executable steps', () => {
        const result = appendSimpleStep(
            definition(
                [step('extract', 'EXTRACT'), step('load', 'LOAD')],
                [{ from: 'extract', to: 'load' }],
            ),
            step('manual', 'TRIGGER'),
        );

        expect(result.steps.map(item => item.key)).toEqual(['manual', 'extract', 'load']);
        expect(result.edges).toEqual([
            { from: 'manual', to: 'extract' },
            { from: 'extract', to: 'load' },
        ]);
    });

    it('rewires execution edges when executable steps are reordered', () => {
        const original = definition(
            [step('extract', 'EXTRACT'), step('first', 'TRANSFORM'), step('second', 'VALIDATE')],
            [
                { from: 'extract', to: 'first' },
                { from: 'first', to: 'second' },
            ],
        );

        const result = moveSimpleStep(original, 2, 1);

        expect(result.steps.map(item => item.key)).toEqual(['extract', 'second', 'first']);
        expect(result.edges).toEqual([
            { from: 'extract', to: 'second' },
            { from: 'second', to: 'first' },
        ]);
    });

    it('repairs the chain after removing a step', () => {
        const original = definition(
            [step('extract', 'EXTRACT'), step('transform', 'TRANSFORM'), step('load', 'LOAD')],
            [
                { from: 'extract', to: 'transform' },
                { from: 'transform', to: 'load' },
            ],
        );

        expect(removeSimpleStep(original, 1).edges).toEqual([
            { from: 'extract', to: 'load' },
        ]);
    });

    it('updates edge endpoints when a step key changes', () => {
        const original = definition(
            [step('extract', 'EXTRACT'), step('load', 'LOAD')],
            [{ from: 'extract', to: 'load' }],
        );

        const result = updateSimpleStep(original, 0, step('source', 'EXTRACT'));

        expect(result.edges).toEqual([{ from: 'source', to: 'load' }]);
    });

    it('blocks list-only structural edits for branched graphs', () => {
        const advanced = definition(
            [step('route', 'ROUTE'), step('left', 'LOAD'), step('right', 'LOAD')],
            [
                { from: 'route', to: 'left', branch: 'left' },
                { from: 'route', to: 'right', branch: 'right' },
            ],
        );

        expect(isSimpleLinearGraph(advanced)).toBe(false);
        expect(canMoveSimpleStep(advanced, 1, 2)).toBe(false);
        expect(moveSimpleStep(advanced, 1, 2)).toBe(advanced);
        expect(removeSimpleStep(advanced, 1)).toBe(advanced);
        expect(appendSimpleStep(advanced, step('extra', 'LOAD'))).toBe(advanced);
    });
});
