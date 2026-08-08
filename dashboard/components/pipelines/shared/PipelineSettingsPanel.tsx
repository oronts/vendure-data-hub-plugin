import * as React from 'react';
import { useCallback } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Switch,
    Label,
} from '@vendure/dashboard';
import { AlertTriangle, GitBranch } from 'lucide-react';
import { PARALLEL_EXECUTION, PIPELINE_RETRY } from '../../../constants';
import { useOptionValues } from '../../../hooks';
import {
    ExecutionContextFields,
    OptionalNumberField,
} from '../../shared/ExecutionContextFields';
import type {
    PipelineContext,
    ErrorHandlingConfig,
    ParallelExecutionConfig,
} from '../../../types';

export interface PipelineSettingsPanelProps {
    readonly context: PipelineContext;
    readonly onChange: (context: PipelineContext) => void;
    readonly errors?: Readonly<Record<string, string>>;
    readonly compact?: boolean;
}

export function PipelineSettingsPanel({
    context,
    onChange,
    errors = {},
    compact = false,
}: PipelineSettingsPanelProps) {
    const { t } = useLingui();
    const {
        options: errorPolicyOptions,
        isLoading: errorPoliciesLoading,
    } = useOptionValues('parallelErrorPolicies');
    const fieldIdPrefix = React.useId();
    const fieldIds = {
        maxRetries: `${fieldIdPrefix}-max-retries`,
        retryDelay: `${fieldIdPrefix}-retry-delay`,
        maxRetryDelay: `${fieldIdPrefix}-max-retry-delay`,
        backoffMultiplier: `${fieldIdPrefix}-backoff-multiplier`,
        parallelEnabled: `${fieldIdPrefix}-parallel-enabled`,
        parallelHelp: `${fieldIdPrefix}-parallel-help`,
        maxConcurrent: `${fieldIdPrefix}-max-concurrent`,
        errorPolicy: `${fieldIdPrefix}-error-policy`,
    } as const;

    const updateErrorHandling = useCallback((
        key: keyof ErrorHandlingConfig,
        value: number | undefined,
    ) => {
        const errorHandling = { ...context.errorHandling };
        if (value === undefined) {
            delete errorHandling[key];
        } else {
            errorHandling[key] = value;
        }
        const next = { ...context };
        if (Object.keys(errorHandling).length === 0) {
            delete next.errorHandling;
        } else {
            next.errorHandling = errorHandling;
        }
        onChange(next);
    }, [context, onChange]);

    const updateParallelExecution = useCallback((parallelExecution: ParallelExecutionConfig) => {
        onChange({ ...context, parallelExecution });
    }, [context, onChange]);

    const labelSize = compact ? 'text-[10px]' : 'text-xs';
    const inputHeight = compact ? 'h-7' : 'h-8';
    const spacing = compact ? 'space-y-3' : 'space-y-4';
    const cardHeaderPadding = compact ? 'py-2 px-3' : 'py-3 px-4';
    const cardContentPadding = compact ? 'px-3 pb-3' : 'px-4 pb-4';
    const fieldError = (path: string): string | undefined => Object.entries(errors)
        .find(([field]) => field === path || field.endsWith(`.${path}`))?.[1];

    return (
        <div className="flex flex-col h-full overflow-auto">
            <div className="p-3 border-b bg-muted/50">
                <h3 className="font-semibold text-sm">
                    <Trans>Pipeline Settings</Trans>
                </h3>
                <p className="text-xs text-muted-foreground">
                    <Trans>Execution configuration</Trans>
                </p>
            </div>

            <div className={`p-3 ${spacing}`}>
                <ExecutionContextFields
                    context={context}
                    onChange={onChange}
                    showIdempotencyKey={true}
                    showExecutionChannel={true}
                    showThroughput={true}
                    errors={errors}
                    compact={compact}
                />

                <Card>
                    <CardHeader className={cardHeaderPadding}>
                        <CardTitle className="text-xs flex items-center gap-2">
                            <AlertTriangle className="h-3 w-3 text-amber-500" />
                            <Trans>Error Handling</Trans>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className={`${cardContentPadding} space-y-3`}>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <OptionalNumberField
                                id={fieldIds.maxRetries}
                                label={t`Max Retries`}
                                value={context.errorHandling?.maxRetries}
                                minimum={0}
                                maximum={PIPELINE_RETRY.MAX_RETRIES}
                                integer={true}
                                labelClassName={labelSize}
                                className={`${inputHeight} text-xs`}
                                placeholder={String(PIPELINE_RETRY.DEFAULT_MAX_RETRIES)}
                                externalError={fieldError('errorHandling.maxRetries')}
                                onChange={value => updateErrorHandling('maxRetries', value)}
                            />
                            <OptionalNumberField
                                id={fieldIds.retryDelay}
                                label={t`Retry Delay (ms)`}
                                value={context.errorHandling?.retryDelayMs}
                                minimum={0}
                                maximum={PIPELINE_RETRY.MAX_DELAY_MS}
                                integer={true}
                                labelClassName={labelSize}
                                className={`${inputHeight} text-xs`}
                                placeholder={String(PIPELINE_RETRY.DEFAULT_DELAY_MS)}
                                externalError={fieldError('errorHandling.retryDelayMs')}
                                onChange={value => updateErrorHandling('retryDelayMs', value)}
                            />
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <OptionalNumberField
                                id={fieldIds.maxRetryDelay}
                                label={t`Max Delay (ms)`}
                                value={context.errorHandling?.maxRetryDelayMs}
                                minimum={0}
                                maximum={PIPELINE_RETRY.MAX_DELAY_MS}
                                integer={true}
                                labelClassName={labelSize}
                                className={`${inputHeight} text-xs`}
                                placeholder={String(PIPELINE_RETRY.DEFAULT_MAX_DELAY_MS)}
                                externalError={fieldError('errorHandling.maxRetryDelayMs')}
                                onChange={value => updateErrorHandling('maxRetryDelayMs', value)}
                            />
                            <OptionalNumberField
                                id={fieldIds.backoffMultiplier}
                                label={t`Backoff Multiplier`}
                                value={context.errorHandling?.backoffMultiplier}
                                minimum={1}
                                maximum={PIPELINE_RETRY.MAX_BACKOFF_MULTIPLIER}
                                labelClassName={labelSize}
                                className={`${inputHeight} text-xs`}
                                placeholder={String(PIPELINE_RETRY.DEFAULT_BACKOFF_MULTIPLIER)}
                                externalError={fieldError('errorHandling.backoffMultiplier')}
                                onChange={value => updateErrorHandling('backoffMultiplier', value)}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className={cardHeaderPadding}>
                        <CardTitle className="text-xs flex items-center gap-2">
                            <GitBranch className="h-3 w-3 text-purple-500" />
                            <Trans>Parallel Execution</Trans>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className={`${cardContentPadding} space-y-3`}>
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor={fieldIds.parallelEnabled} className={labelSize}>
                                    <Trans>Enable Parallel Steps</Trans>
                                </Label>
                                <p id={fieldIds.parallelHelp} className={`${labelSize} text-muted-foreground`}>
                                    <Trans>Run independent steps concurrently</Trans>
                                </p>
                            </div>
                            <Switch
                                id={fieldIds.parallelEnabled}
                                aria-describedby={fieldIds.parallelHelp}
                                checked={context.parallelExecution?.enabled ?? false}
                                onCheckedChange={(v) => updateParallelExecution({
                                    ...context.parallelExecution,
                                    enabled: v,
                                })}
                            />
                        </div>
                        {context.parallelExecution?.enabled && (
                            <>
                                <div className="space-y-1">
                                    <OptionalNumberField
                                        id={fieldIds.maxConcurrent}
                                        label={t`Max Concurrent Steps`}
                                        value={context.parallelExecution?.maxConcurrentSteps}
                                        minimum={PARALLEL_EXECUTION.MIN_CONCURRENT_STEPS}
                                        maximum={PARALLEL_EXECUTION.MAX_CONCURRENT_STEPS}
                                        integer={true}
                                        labelClassName={labelSize}
                                        className={`${inputHeight} text-xs`}
                                        placeholder={String(PARALLEL_EXECUTION.DEFAULT_MAX_CONCURRENT_STEPS)}
                                        externalError={fieldError('parallelExecution.maxConcurrentSteps')}
                                        onChange={maxConcurrentSteps => updateParallelExecution({
                                            ...context.parallelExecution,
                                            maxConcurrentSteps,
                                        })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor={fieldIds.errorPolicy} className={labelSize}>
                                        <Trans>Error Policy</Trans>
                                    </Label>
                                    <Select
                                        disabled={errorPoliciesLoading}
                                        value={context.parallelExecution?.errorPolicy ?? 'FAIL_FAST'}
                                        onValueChange={(v) => updateParallelExecution({
                                            ...context.parallelExecution,
                                            errorPolicy: v as 'FAIL_FAST' | 'CONTINUE' | 'BEST_EFFORT',
                                        })}
                                    >
                                        <SelectTrigger
                                            id={fieldIds.errorPolicy}
                                            className={`${inputHeight} text-xs`}
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {errorPolicyOptions.map(policy => (
                                                <SelectItem key={policy.value} value={policy.value}>{policy.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {fieldError('parallelExecution.errorPolicy') && (
                                        <p className="text-xs text-destructive">
                                            {fieldError('parallelExecution.errorPolicy')}
                                        </p>
                                    )}
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
