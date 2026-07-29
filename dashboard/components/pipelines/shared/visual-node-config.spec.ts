import { describe, expect, it } from 'vitest';
import type { StepConfig } from '../../../constants/steps';
import {
    VISUAL_NODE_CONFIGS,
    buildVisualNodeConfigs,
    resolveVisualNodeText,
} from './visual-node-config';

describe('visual node text', () => {
    it('uses caller-localized plugin fallback metadata', () => {
        const fallback = {
            label: 'Translated source',
            description: 'Translated data source',
        };
        const text = resolveVisualNodeText(
            VISUAL_NODE_CONFIGS.source,
            fallback,
        );

        expect(text).toEqual(fallback);
    });

    it('preserves backend adapter metadata without sending it through translation', () => {
        const backendConfig: StepConfig = {
            type: 'EXTRACT',
            label: 'Customer-provided source',
            description: 'Source description from the adapter catalog',
            icon: 'Globe',
            color: '#123456',
            bgColor: '#ffffff',
            borderColor: '#123456',
            inputs: 0,
            outputs: 1,
            adapterType: 'EXTRACTOR',
            nodeType: 'source',
        };
        const config = buildVisualNodeConfigs({ EXTRACT: backendConfig }).source;
        const text = resolveVisualNodeText(config, {
            label: 'Translated fallback',
            description: 'Translated fallback description',
        });

        expect(text).toEqual({
            label: backendConfig.label,
            description: backendConfig.description,
        });
    });
});
