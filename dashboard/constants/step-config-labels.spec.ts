import { describe, expect, it } from 'vitest';
import { STEP_CONFIG_TRANSLATION_IDS } from './step-config-labels';

describe('step configuration translation IDs', () => {
    it('uses unique IDs in the stepConfig namespace', () => {
        const ids = Object.values(STEP_CONFIG_TRANSLATION_IDS);

        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.every(id => id.startsWith('stepConfig.'))).toBe(true);
    });
});
