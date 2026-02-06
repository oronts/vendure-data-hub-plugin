import { PipelineStepDefinition } from '../../shared/types';

function isConfigObject(config: unknown): config is Record<string, unknown> {
    return config !== null && typeof config === 'object' && !Array.isArray(config);
}

export function getStepStrategy(step: PipelineStepDefinition): string | undefined {
    if (!step || !isConfigObject(step.config)) {
        return undefined;
    }
    const { strategy } = step.config;
    return typeof strategy === 'string' ? strategy : undefined;
}
