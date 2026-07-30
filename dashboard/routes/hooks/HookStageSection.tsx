import * as React from 'react';
import { Badge } from '@vendure/dashboard';
import { Trans, useLingui } from '@lingui/react/macro';
import { CheckCircle2, Loader2, Play, XCircle } from 'lucide-react';
import type { HookStageCategoryConfig } from '../../hooks';
import type { HookStage } from './hook-stages';
import {
    getResponsiveHookGridClass,
    isHookStageConfigured,
} from './hook-view-model';

interface HookStageSectionProps {
    readonly categoryInfo: HookStageCategoryConfig;
    readonly stages: readonly HookStage[];
    readonly hooks: Readonly<Record<string, unknown>>;
    readonly selectedStage: HookStage | null;
    readonly isPending: boolean;
    readonly testResult: 'success' | 'error' | null;
    readonly onTest: (stage: HookStage) => void;
    readonly disabledReason: string | null;
}

export function HookStageSection({
    categoryInfo,
    stages: allStages,
    hooks,
    selectedStage,
    isPending,
    testResult,
    onTest,
    disabledReason,
}: HookStageSectionProps) {
    const { t } = useLingui();
    const stages = allStages.filter(stage => stage.category === categoryInfo.key);
    if (stages.length === 0) return null;

    return (
        <section className="mb-6" aria-labelledby={`hook-category-${categoryInfo.key}`}>
            <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                <Badge
                    id={`hook-category-${categoryInfo.key}`}
                    className={categoryInfo.color}
                >
                    {categoryInfo.label}
                </Badge>
                <span className="text-sm text-muted-foreground">
                    {categoryInfo.description}
                </span>
            </div>
            <div className={`grid gap-3 ${getResponsiveHookGridClass(categoryInfo.gridClass)}`}>
                {stages.map(stage => {
                    const isConfigured = isHookStageConfigured(hooks[stage.key]);
                    const isSelected = selectedStage?.key === stage.key;
                    const reason = disabledReason
                        ?? (!isConfigured ? t`Not configured in this pipeline` : null)
                        ?? (isPending && !isSelected ? t`Another hook test is running` : null);
                    return (
                        <HookStageCard
                            key={stage.key}
                            stage={stage}
                            isConfigured={isConfigured}
                            isSelected={isSelected}
                            isLoading={isPending && isSelected}
                            testResult={isSelected ? testResult : null}
                            onTest={() => onTest(stage)}
                            disabled={isPending || reason !== null}
                            disabledReason={reason}
                        />
                    );
                })}
            </div>
        </section>
    );
}

const HookStageCard = React.memo(function HookStageCard({
    stage,
    isConfigured,
    isSelected,
    isLoading,
    testResult,
    onTest,
    disabled,
    disabledReason,
}: Readonly<{
    stage: HookStage;
    isConfigured: boolean;
    isSelected: boolean;
    isLoading: boolean;
    testResult: 'success' | 'error' | null;
    onTest: () => void;
    disabled: boolean;
    disabledReason: string | null;
}>) {
    const { t } = useLingui();
    const status = isLoading
        ? t`Testing ${stage.label}`
        : testResult === 'success'
            ? t`${stage.label} test succeeded`
            : testResult === 'error'
                ? t`${stage.label} test failed`
                : null;

    return (
        <button
            type="button"
            className={`
                w-full rounded-lg border p-3 text-left transition-all
                disabled:cursor-not-allowed disabled:opacity-50
                enabled:hover:border-primary enabled:hover:shadow-sm
                ${isSelected ? 'border-primary ring-1 ring-primary' : ''}
                ${isConfigured ? 'bg-primary/5' : ''}
            `}
            onClick={onTest}
            disabled={disabled}
            aria-label={disabledReason
                ? `${stage.label}: ${disabledReason}`
                : t`Test the ${stage.label} hook stage`}
        >
            <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <div className={`shrink-0 rounded p-1.5 ${isConfigured ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        <stage.icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <div className="break-words text-sm font-medium">{stage.label}</div>
                        {isConfigured && (
                            <Badge variant="outline" className="mt-0.5 text-xs">
                                <Trans>Configured</Trans>
                            </Badge>
                        )}
                    </div>
                </div>
                {isLoading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />}
                {!isLoading && testResult === 'success' && (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
                )}
                {!isLoading && testResult === 'error' && (
                    <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
                )}
                {status && <span className="sr-only" role="status">{status}</span>}
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">
                {stage.description}
            </p>
            <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                {disabledReason ?? (
                    <span className="flex items-center gap-1">
                        <Play className="h-3 w-3" aria-hidden="true" />
                        <Trans>Test hook</Trans>
                    </span>
                )}
            </div>
        </button>
    );
});
