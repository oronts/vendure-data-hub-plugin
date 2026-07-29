import type { HookStageCategoryConfig } from '../../hooks';
import type { HookStageConfig } from '../../hooks/api/config-options.types';
import type { ValidationIssue } from '../../types';

export type PipelineHookMap = Readonly<Record<string, unknown>>;

export interface ConfiguredHookStage extends HookStageConfig {
    readonly hooks: readonly unknown[];
}

export interface ConfiguredHookStageGroup {
    readonly category: HookStageCategoryConfig;
    readonly stages: readonly ConfiguredHookStage[];
}

export function countPipelineHooks(hooks: PipelineHookMap): number {
    return Object.values(hooks).reduce<number>(
        (count, value) => count + (Array.isArray(value) ? value.length : 0),
        0,
    );
}

export function getConfiguredHookStageGroups(
    categories: readonly HookStageCategoryConfig[],
    stages: readonly HookStageConfig[],
    hooks: PipelineHookMap,
): ConfiguredHookStageGroup[] {
    return categories.flatMap(category => {
        const configuredStages = stages
            .filter(stage => stage.category === category.key)
            .flatMap(stage => {
                const stageHooks = hooks[stage.key];
                return Array.isArray(stageHooks) && stageHooks.length > 0
                    ? [{ ...stage, hooks: stageHooks }]
                    : [];
            });
        return configuredStages.length > 0
            ? [{ category, stages: configuredStages }]
            : [];
    });
}

export function getStepValidationErrors(
    issues: readonly ValidationIssue[],
    stepKey: string | undefined,
): Record<string, string> {
    if (!stepKey) return {};
    return getFieldErrors(issues.filter(issue => issue.stepKey === stepKey));
}

export function getPipelineValidationErrors(
    issues: readonly ValidationIssue[],
): Record<string, string> {
    return getFieldErrors(issues.filter(issue => !issue.stepKey));
}

function getFieldErrors(issues: readonly ValidationIssue[]): Record<string, string> {
    return Object.fromEntries(
        issues
            .filter(issue => issue.field)
            .map(issue => [String(issue.field), issue.message]),
    );
}
