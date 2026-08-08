import { describe, expect, it } from 'vitest';
import { Circle, Play } from 'lucide-react';
import { buildHookStages } from './hook-stages';

describe('hook stage metadata', () => {
    it('preserves backend categories and resolves known icons', () => {
        const [stage] = buildHookStages([{
            key: 'CUSTOM_STAGE',
            label: 'Custom stage',
            description: 'Added by the backend',
            icon: 'play',
            category: 'custom',
        }]);

        expect(stage).toMatchObject({
            key: 'CUSTOM_STAGE',
            category: 'custom',
            icon: Play,
            examplePayload: {},
        });
    });

    it('uses a safe icon fallback and known test payloads', () => {
        const [stage] = buildHookStages([{
            key: 'PIPELINE_STARTED',
            label: 'Pipeline started',
            description: 'Run started',
            icon: 'unknown-icon',
            category: 'lifecycle',
        }]);

        expect(stage.icon).toBe(Circle);
        expect(stage.examplePayload).toEqual({
            pipelineCode: 'my-pipeline',
            runId: '123',
        });
    });
});
