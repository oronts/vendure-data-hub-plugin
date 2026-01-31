import { PipelineStepDefinition } from '../../shared/types';

/**
 * Type guard to check if config is a valid object
 */
function isConfigObject(config: unknown): config is Record<string, unknown> {
    return config !== null && typeof config === 'object' && !Array.isArray(config);
}

/**
 * Safely extract adapter code from a step configuration
 *
 * @param step - Pipeline step definition
 * @returns The adapter code if present and valid, undefined otherwise
 */
export function getAdapterCode(step: PipelineStepDefinition): string | undefined {
    if (!step || !isConfigObject(step.config)) {
        return undefined;
    }
    const { adapterCode } = step.config;
    return typeof adapterCode === 'string' ? adapterCode : undefined;
}

/**
 * Safely extract strategy from a step configuration
 *
 * @param step - Pipeline step definition
 * @returns The strategy if present and valid, undefined otherwise
 */
export function getStepStrategy(step: PipelineStepDefinition): string | undefined {
    if (!step || !isConfigObject(step.config)) {
        return undefined;
    }
    const { strategy } = step.config;
    return typeof strategy === 'string' ? strategy : undefined;
}
