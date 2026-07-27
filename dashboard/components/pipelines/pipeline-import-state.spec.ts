import { describe, expect, it } from 'vitest';
import type { PipelineDefinition } from '../../types';
import { getCurrentValidatedDefinition } from './pipeline-import-state';

describe('getCurrentValidatedDefinition', () => {
    const definition = { version: 1, steps: [] } as unknown as PipelineDefinition;

    it('returns the definition only while the editor text matches the validated input', () => {
        const validated = { sourceText: '{"version":1,"steps":[]}', definition };

        expect(getCurrentValidatedDefinition(validated, validated.sourceText)).toBe(definition);
        expect(getCurrentValidatedDefinition(validated, '{"version":2,"steps":[]}')).toBeNull();
    });

    it('returns null before validation', () => {
        expect(getCurrentValidatedDefinition(null, '')).toBeNull();
    });
});
