import * as React from 'react';
import { useCallback } from 'react';
import {
    Input,
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
import { Clock, AlertTriangle, Zap, GitBranch } from 'lucide-react';
import {
    PIPELINE_RETRY_DEFAULTS,
    PIPELINE_CHECKPOINT_DEFAULTS,
    CHECKPOINT_STRATEGY,
} from '../../../constants';
import { useOptionValues } from '../../../hooks';
import type {
    PipelineContext,
    ErrorHandlingConfig,
    CheckpointingConfig,
    Throughput,
    RunModeValue,
    CheckpointStrategy,
    ParallelExecutionConfig,
} from '../../../types';

export interface PipelineSettingsPanelProps {
    readonly context: PipelineContext;
    readonly onChange: (context: PipelineContext) => void;
    readonly compact?: boolean;
}

export function PipelineSettingsPanel({ context, onChange, compact = false }: PipelineSettingsPanelProps) {
    const { options: runModeOptions } = useOptionValues('runModes');
    const { options: checkpointStrategyOptions } = useOptionValues('checkpointStrategies');
    const { options: errorPolicyOptions } = useOptionValues('parallelErrorPolicies');

    const updateErrorHandling = useCallback((errorHandling: ErrorHandlingConfig) => {
        onChange({ ...context, errorHandling });
    }, [context, onChange]);

    const updateCheckpointing = useCallback((checkpointing: CheckpointingConfig) => {
        onChange({ ...context, checkpointing });
    }, [context, onChange]);

    const updateThroughput = useCallback((throughput: Throughput) => {
        onChange({ ...context, throughput });
    }, [context, onChange]);

    const updateParallelExecution = useCallback((parallelExecution: ParallelExecutionConfig) => {
        onChange({ ...context, parallelExecution });
    }, [context, onChange]);

    const labelSize = compact ? 'text-[10px]' : 'text-xs';
    const inputHeight = compact ? 'h-7' : 'h-8';
    const spacing = compact ? 'space-y-3' : 'space-y-4';
    const cardHeaderPadding = compact ? 'py-2 px-3' : 'py-3 px-4';
    const cardContentPadding = compact ? 'px-3 pb-3' : 'px-4 pb-4';

    return (
        <div className="flex flex-col h-full overflow-auto">
            <div className="p-3 border-b bg-muted/50">
                <h3 className="font-semibold text-sm">Pipeline Settings</h3>
                <p className="text-xs text-muted-foreground">Execution configuration</p>
            </div>

            <div className={`p-3 ${spacing}`}>
                <div className="space-y-2">
                    <Label className={labelSize}>Run Mode</Label>
                    <Select
                        value={context.runMode ?? 'BATCH'}
                        onValueChange={(v) => onChange({ ...context, runMode: v as RunModeValue })}
                    >
                        <SelectTrigger className={`${labelSize} ${inputHeight}`}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {runModeOptions.map(mode => (
                                <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <Card>
                    <CardHeader className={cardHeaderPadding}>
                        <CardTitle className="text-xs flex items-center gap-2">
                            <AlertTriangle className="h-3 w-3 text-amber-500" />
                            Error Handling
                        </CardTitle>
                    </CardHeader>
                    <CardContent className={`${cardContentPadding} space-y-3`}>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className={labelSize}>Max Retries</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={10}
                                    value={context.errorHandling?.maxRetries ?? 3}
                                    onChange={(e) => updateErrorHandling({
                                        ...context.errorHandling,
                                        maxRetries: parseInt(e.target.value) || 0,
                                    })}
                                    className={`${inputHeight} text-xs`}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className={labelSize}>Retry Delay (ms)</Label>
                                <Input
                                    type="number"
                                    min={100}
                                    value={context.errorHandling?.retryDelayMs ?? PIPELINE_RETRY_DEFAULTS.DELAY_MS}
                                    onChange={(e) => updateErrorHandling({
                                        ...context.errorHandling,
                                        retryDelayMs: parseInt(e.target.value) || PIPELINE_RETRY_DEFAULTS.DELAY_MS,
                                    })}
                                    className={`${inputHeight} text-xs`}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className={labelSize}>Max Delay (ms)</Label>
                                <Input
                                    type="number"
                                    min={PIPELINE_RETRY_DEFAULTS.MIN_DELAY_MS}
                                    value={context.errorHandling?.maxRetryDelayMs ?? PIPELINE_RETRY_DEFAULTS.MAX_DELAY_MS}
                                    onChange={(e) => updateErrorHandling({
                                        ...context.errorHandling,
                                        maxRetryDelayMs: parseInt(e.target.value) || PIPELINE_RETRY_DEFAULTS.MAX_DELAY_MS,
                                    })}
                                    className={`${inputHeight} text-xs`}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className={labelSize}>Backoff Multiplier</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={5}
                                    step={0.5}
                                    value={context.errorHandling?.backoffMultiplier ?? 2}
                                    onChange={(e) => updateErrorHandling({
                                        ...context.errorHandling,
                                        backoffMultiplier: parseFloat(e.target.value) || 2,
                                    })}
                                    className={`${inputHeight} text-xs`}
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <Label className={labelSize}>Dead Letter Queue</Label>
                            <Switch
                                checked={context.errorHandling?.deadLetterQueue ?? false}
                                onCheckedChange={(v) => updateErrorHandling({
                                    ...context.errorHandling,
                                    deadLetterQueue: v,
                                })}
                            />
                        </div>
                        {context.errorHandling?.deadLetterQueue && (
                            <div className="flex items-center justify-between">
                                <Label className={labelSize}>Alert on Dead Letter</Label>
                                <Switch
                                    checked={context.errorHandling?.alertOnDeadLetter ?? false}
                                    onCheckedChange={(v) => updateErrorHandling({
                                        ...context.errorHandling,
                                        alertOnDeadLetter: v,
                                    })}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className={cardHeaderPadding}>
                        <CardTitle className="text-xs flex items-center gap-2">
                            <Clock className="h-3 w-3 text-blue-500" />
                            Checkpointing
                        </CardTitle>
                    </CardHeader>
                    <CardContent className={`${cardContentPadding} space-y-3`}>
                        <div className="flex items-center justify-between">
                            <Label className={labelSize}>Enable Checkpointing</Label>
                            <Switch
                                checked={context.checkpointing?.enabled ?? false}
                                onCheckedChange={(v) => updateCheckpointing({
                                    ...context.checkpointing,
                                    enabled: v,
                                })}
                            />
                        </div>
                        {context.checkpointing?.enabled && (
                            <>
                                <div className="space-y-1">
                                    <Label className={labelSize}>Strategy</Label>
                                    <Select
                                        value={context.checkpointing?.strategy ?? CHECKPOINT_STRATEGY.COUNT}
                                        onValueChange={(v) => updateCheckpointing({
                                            ...context.checkpointing,
                                            strategy: v as CheckpointStrategy,
                                        })}
                                    >
                                        <SelectTrigger className={`${inputHeight} text-xs`}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {checkpointStrategyOptions.map(opt => (
                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {context.checkpointing?.strategy === CHECKPOINT_STRATEGY.COUNT && (
                                    <div className="space-y-1">
                                        <Label className={labelSize}>Checkpoint Every N Records</Label>
                                        <Input
                                            type="number"
                                            min={100}
                                            value={context.checkpointing?.intervalRecords ?? PIPELINE_CHECKPOINT_DEFAULTS.INTERVAL_RECORDS}
                                            onChange={(e) => updateCheckpointing({
                                                ...context.checkpointing,
                                                intervalRecords: parseInt(e.target.value) || PIPELINE_CHECKPOINT_DEFAULTS.INTERVAL_RECORDS,
                                            })}
                                            className={`${inputHeight} text-xs`}
                                        />
                                    </div>
                                )}
                                {context.checkpointing?.strategy === CHECKPOINT_STRATEGY.INTERVAL && (
                                    <div className="space-y-1">
                                        <Label className={labelSize}>Checkpoint Interval (ms)</Label>
                                        <Input
                                            type="number"
                                            min={PIPELINE_CHECKPOINT_DEFAULTS.MIN_INTERVAL_MS}
                                            value={context.checkpointing?.intervalMs ?? PIPELINE_CHECKPOINT_DEFAULTS.INTERVAL_MS}
                                            onChange={(e) => updateCheckpointing({
                                                ...context.checkpointing,
                                                intervalMs: parseInt(e.target.value) || PIPELINE_CHECKPOINT_DEFAULTS.INTERVAL_MS,
                                            })}
                                            className={`${inputHeight} text-xs`}
                                        />
                                    </div>
                                )}
                                {context.checkpointing?.strategy === CHECKPOINT_STRATEGY.TIMESTAMP && (
                                    <div className="space-y-1">
                                        <Label className={labelSize}>Timestamp Field</Label>
                                        <Input
                                            value={context.checkpointing?.field ?? 'updatedAt'}
                                            onChange={(e) => updateCheckpointing({
                                                ...context.checkpointing,
                                                field: e.target.value,
                                            })}
                                            placeholder="updatedAt"
                                            className={`${inputHeight} text-xs`}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className={cardHeaderPadding}>
                        <CardTitle className="text-xs flex items-center gap-2">
                            <Zap className="h-3 w-3 text-green-500" />
                            Throughput
                        </CardTitle>
                    </CardHeader>
                    <CardContent className={`${cardContentPadding} space-y-3`}>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className={labelSize}>Batch Size</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={context.throughput?.batchSize ?? 100}
                                    onChange={(e) => updateThroughput({
                                        ...context.throughput,
                                        batchSize: parseInt(e.target.value) || 100,
                                    })}
                                    className={`${inputHeight} text-xs`}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className={labelSize}>Concurrency</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={32}
                                    value={context.throughput?.concurrency ?? 4}
                                    onChange={(e) => updateThroughput({
                                        ...context.throughput,
                                        concurrency: parseInt(e.target.value) || 4,
                                    })}
                                    className={`${inputHeight} text-xs`}
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className={labelSize}>Rate Limit (requests/sec)</Label>
                            <Input
                                type="number"
                                min={0}
                                value={context.throughput?.rateLimitRps ?? 0}
                                onChange={(e) => updateThroughput({
                                    ...context.throughput,
                                    rateLimitRps: parseInt(e.target.value) || 0,
                                })}
                                placeholder="0 = unlimited"
                                className={`${inputHeight} text-xs`}
                            />
                            <p className={`${labelSize} text-muted-foreground`}>0 = no rate limiting</p>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className={cardHeaderPadding}>
                        <CardTitle className="text-xs flex items-center gap-2">
                            <GitBranch className="h-3 w-3 text-purple-500" />
                            Parallel Execution
                        </CardTitle>
                    </CardHeader>
                    <CardContent className={`${cardContentPadding} space-y-3`}>
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className={labelSize}>Enable Parallel Steps</Label>
                                <p className={`${labelSize} text-muted-foreground`}>
                                    Run independent steps concurrently
                                </p>
                            </div>
                            <Switch
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
                                    <Label className={labelSize}>Max Concurrent Steps</Label>
                                    <Input
                                        type="number"
                                        min={2}
                                        max={16}
                                        value={context.parallelExecution?.maxConcurrentSteps ?? 4}
                                        onChange={(e) => updateParallelExecution({
                                            ...context.parallelExecution,
                                            maxConcurrentSteps: parseInt(e.target.value) || 4,
                                        })}
                                        className={`${inputHeight} text-xs`}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className={labelSize}>Error Policy</Label>
                                    <Select
                                        value={context.parallelExecution?.errorPolicy ?? 'FAIL_FAST'}
                                        onValueChange={(v) => updateParallelExecution({
                                            ...context.parallelExecution,
                                            errorPolicy: v as 'FAIL_FAST' | 'CONTINUE' | 'BEST_EFFORT',
                                        })}
                                    >
                                        <SelectTrigger className={`${inputHeight} text-xs`}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {errorPolicyOptions.map(policy => (
                                                <SelectItem key={policy.value} value={policy.value}>{policy.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
