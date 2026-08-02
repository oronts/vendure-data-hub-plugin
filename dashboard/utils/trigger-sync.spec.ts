import { describe, expect, it } from 'vitest';
import type { PipelineDefinition, PipelineTrigger } from '../types';
import { getCombinedTriggers, updateDefinitionWithTriggers } from './trigger-sync';

function definition(): PipelineDefinition {
    return {
        version: 1,
        steps: [
            { key: 'manual', type: 'TRIGGER', config: { type: 'MANUAL' } },
            { key: 'schedule', type: 'TRIGGER', config: { type: 'SCHEDULE' } },
            { key: 'extract', type: 'EXTRACT', config: {} },
            { key: 'load', type: 'LOAD', config: {} },
        ],
        edges: [
            { from: 'manual', to: 'extract' },
            { from: 'schedule', to: 'extract' },
            { from: 'extract', to: 'load' },
        ],
    };
}

describe('trigger synchronization', () => {
    it('removes every edge connected to a deleted trigger step', () => {
        const original = definition();
        original.edges?.push({ from: 'load', to: 'manual', dependencyOnly: true });
        const remaining = getCombinedTriggers(original).filter(trigger => trigger.type === 'SCHEDULE');

        const result = updateDefinitionWithTriggers(original, remaining);

        expect(result.steps.map(step => step.key)).not.toContain('manual');
        expect(result.edges).toEqual([
            { from: 'schedule', to: 'extract' },
            { from: 'extract', to: 'load' },
        ]);
    });

    it('preserves an existing trigger route when its configuration changes', () => {
        const original = definition();
        original.edges = [
            { from: 'manual', to: 'load', branch: 'manual-route' },
            { from: 'extract', to: 'load' },
        ];
        const [manual] = getCombinedTriggers(original);

        const result = updateDefinitionWithTriggers(original, [{ ...manual, enabled: false }]);

        expect(result.edges).toEqual([
            { from: 'manual', to: 'load', branch: 'manual-route' },
            { from: 'extract', to: 'load' },
        ]);
    });

    it('connects only a newly added trigger to the first executable step', () => {
        const original = definition();
        original.edges = [
            { from: 'manual', to: 'load', branch: 'manual-route' },
            { from: 'schedule', to: 'extract' },
            { from: 'extract', to: 'load' },
        ];
        const newTrigger: PipelineTrigger = { type: 'WEBHOOK', enabled: true };

        const result = updateDefinitionWithTriggers(
            original,
            [...getCombinedTriggers(original), newTrigger],
        );
        const webhookStep = result.steps.find(step => step.config?.type === 'WEBHOOK');

        expect(webhookStep).toBeDefined();
        expect(result.edges).toContainEqual({ from: 'manual', to: 'load', branch: 'manual-route' });
        expect(result.edges).toContainEqual({ from: webhookStep?.key, to: 'extract' });
    });

    it('assigns unique keys when multiple keyless triggers are added together', () => {
        const original = definition();
        const result = updateDefinitionWithTriggers(original, [
            ...getCombinedTriggers(original),
            { type: 'WEBHOOK', enabled: true },
            { type: 'FILE', enabled: true },
        ]);
        const generatedKeys = result.steps
            .filter(step => step.config.type === 'WEBHOOK' || step.config.type === 'FILE')
            .map(step => step.key);

        expect(generatedKeys).toHaveLength(2);
        expect(new Set(generatedKeys).size).toBe(2);
    });
});
