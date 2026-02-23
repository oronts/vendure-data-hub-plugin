import { Circle } from 'lucide-react';
import type { HookStageConfig } from '../../hooks/api/use-config-options';
import { resolveIconName } from '../../utils/icon-resolver';

export interface HookStage {
    key: string;
    label: string;
    description: string;
    icon: React.ElementType;
    category: 'lifecycle' | 'data' | 'error';
    examplePayload: Record<string, unknown>;
}

/**
 * Example payloads for hook testing (frontend-only, keyed by stage).
 * These are documentation data, not served from the backend.
 */
const EXAMPLE_PAYLOADS: Record<string, Record<string, unknown>> = {
    PIPELINE_STARTED: { pipelineCode: 'my-pipeline', runId: '123' },
    PIPELINE_COMPLETED: { pipelineCode: 'my-pipeline', runId: '123', recordsProcessed: 100, duration: 5000 },
    PIPELINE_FAILED: { pipelineCode: 'my-pipeline', runId: '123', error: 'Connection timeout' },
    BEFORE_EXTRACT: { stepKey: 'extract', config: {} },
    AFTER_EXTRACT: { stepKey: 'extract', recordCount: 50, records: [{ id: 1 }] },
    BEFORE_TRANSFORM: { stepKey: 'transform', recordCount: 50 },
    AFTER_TRANSFORM: { stepKey: 'transform', recordCount: 48, dropped: 2 },
    BEFORE_VALIDATE: { stepKey: 'validate', schemaCode: 'product-schema' },
    AFTER_VALIDATE: { stepKey: 'validate', valid: 45, invalid: 3 },
    BEFORE_ENRICH: { stepKey: 'enrich' },
    AFTER_ENRICH: { stepKey: 'enrich', enrichedFields: ['category', 'price'] },
    BEFORE_ROUTE: { stepKey: 'route', recordCount: 45 },
    AFTER_ROUTE: { stepKey: 'route', destinations: { products: 30, inventory: 15 } },
    BEFORE_LOAD: { stepKey: 'load', destination: 'vendure', recordCount: 45 },
    AFTER_LOAD: { stepKey: 'load', created: 20, updated: 25, errors: 0 },
    ON_ERROR: { error: 'Validation failed', record: { id: 1 }, stepKey: 'validate' },
    ON_RETRY: { errorId: '456', attempt: 2, maxAttempts: 3 },
    ON_DEAD_LETTER: { errorId: '456', reason: 'Max retries exceeded', record: { id: 1 } },
};

/**
 * Build HookStage objects from backend metadata, merging in frontend-only
 * examplePayloads and resolving icon names to Lucide components.
 */
export function buildHookStages(backendStages: HookStageConfig[]): HookStage[] {
    return backendStages.map(stage => ({
        key: stage.key,
        label: stage.label,
        description: stage.description,
        icon: resolveIconName(stage.icon) ?? Circle,
        category: stage.category as HookStage['category'],
        examplePayload: EXAMPLE_PAYLOADS[stage.key] ?? {},
    }));
}
