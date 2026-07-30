import type { StepMappings } from '../constants/step-mappings';
import type { VisualNodeCategory } from '../types';

export function resolveAdapterPresentation(
    adapterType: string,
    mappings: Pick<
        StepMappings,
        'adapterTypeToNodeType' | 'adapterTypeToCategory'
    >,
): { nodeType: VisualNodeCategory; category: string } {
    return {
        nodeType: mappings.adapterTypeToNodeType[adapterType] ??
            'transform',
        category: mappings.adapterTypeToCategory[adapterType] ?? 'other',
    };
}
