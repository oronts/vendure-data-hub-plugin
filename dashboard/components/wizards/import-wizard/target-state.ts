import type { ImportConfiguration } from './types';
import { DEFAULT_IMPORT_STRATEGIES } from './constants';

export function createImportTargetChange(
    config: Partial<ImportConfiguration>,
    targetEntity: string,
): Partial<ImportConfiguration> {
    if (targetEntity === config.targetEntity) return { targetEntity };

    return {
        targetEntity,
        targetSchema: undefined,
        mappings: [],
        strategies: {
            ...DEFAULT_IMPORT_STRATEGIES,
            ...config.strategies,
            lookupFields: [],
        },
    };
}
