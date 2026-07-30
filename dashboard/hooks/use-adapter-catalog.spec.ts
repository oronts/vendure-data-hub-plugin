import { describe, expect, it } from 'vitest';
import { resolveAdapterPresentation } from './adapter-presentation';

describe('resolveAdapterPresentation', () => {
    it('uses the current runtime step mappings', () => {
        expect(resolveAdapterPresentation('CUSTOM', {
            adapterTypeToNodeType: { CUSTOM: 'enrich' },
            adapterTypeToCategory: { CUSTOM: 'TRANSFORMS' },
        })).toEqual({
            nodeType: 'enrich',
            category: 'TRANSFORMS',
        });
    });

    it('uses safe presentation defaults for an unknown adapter type', () => {
        expect(resolveAdapterPresentation('UNKNOWN', {
            adapterTypeToNodeType: {},
            adapterTypeToCategory: {},
        })).toEqual({
            nodeType: 'transform',
            category: 'other',
        });
    });
});
