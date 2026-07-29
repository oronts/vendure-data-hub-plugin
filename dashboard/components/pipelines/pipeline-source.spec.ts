import { describe, expect, it } from 'vitest';
import { toPipelineTs } from './pipeline-source';

describe('toPipelineTs', () => {
    it('uses the published package entry point', () => {
        const source = toPipelineTs({ version: 1, steps: [] });

        expect(source).toContain("from '@oronts/vendure-data-hub-plugin'");
        expect(source).not.toContain("from '@vendure/data-hub'");
        expect(source).toContain('definePipeline({');
    });
});
