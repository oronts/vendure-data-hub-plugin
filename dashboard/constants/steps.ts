import type { StepType } from '../../shared/types';
import { STEP_TYPE, SHARED_STEP_TYPE_CONFIGS } from '../../shared/constants';

export { STEP_TYPE };

export interface StepConfig {
    readonly type: StepType;
    readonly label: string;
    readonly description: string;
    readonly icon: string;
    readonly color: string;
    readonly bgColor: string;
    readonly borderColor: string;
    readonly inputs: number;
    readonly outputs: number;
    /** Backend adapter type for registry lookup (e.g. EXTRACTOR, OPERATOR). Null for step types without adapters. */
    readonly adapterType: string | null;
    /** Visual node type for the pipeline editor (e.g. source, transform, load). */
    readonly nodeType: string;
}

/**
 * Static fallback step configs used during loading before backend data is available.
 * At runtime, prefer `useStepConfigs()` hook which returns backend-driven data.
 * Also used by non-React code (visual-node-config, step-mappings) that cannot call hooks.
 *
 * Derived from the shared single source of truth (SHARED_STEP_TYPE_CONFIGS).
 */
export const DEFAULT_STEP_CONFIGS: Record<StepType, StepConfig> =
    SHARED_STEP_TYPE_CONFIGS.reduce(
        (acc, cfg) => {
            acc[cfg.type] = cfg;
            return acc;
        },
        {} as Record<StepType, StepConfig>,
    );

