import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    ChannelSelector,
    Input,
    Label,
    LanguageSelector,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    useChannel,
} from '@vendure/dashboard';
import { X } from 'lucide-react';
import { useOptionValues } from '../../hooks';
import { PARALLEL_EXECUTION, THROUGHPUT_LIMITS } from '../../constants';
import type {
    ChannelStrategy,
    Throughput,
    ValidationModeType,
} from '../../types';

const PIPELINE_DEFAULT = '__PIPELINE_DEFAULT__';
const ACTIVE_CHANNEL = '__ACTIVE_CHANNEL__';

export interface ExecutionContextValue {
    readonly channel?: string;
    readonly contentLanguage?: string;
    readonly channelStrategy?: ChannelStrategy;
    readonly channelIds?: string[];
    readonly validationMode?: ValidationModeType;
    readonly throughput?: Throughput;
    readonly idempotencyKeyField?: string;
}

export interface ExecutionContextFieldsProps<TContext extends ExecutionContextValue> {
    readonly context: TContext;
    readonly onChange: (context: TContext) => void;
    readonly allowPipelineDefaults?: boolean;
    readonly showIdempotencyKey?: boolean;
    readonly showExecutionChannel?: boolean;
    readonly showThroughput?: boolean;
    readonly errors?: Readonly<Record<string, string>>;
    readonly compact?: boolean;
}

interface OptionalNumberFieldProps {
    readonly id: string;
    readonly label: React.ReactNode;
    readonly value: number | undefined;
    readonly minimum: number;
    readonly maximum?: number;
    readonly integer?: boolean;
    readonly className?: string;
    readonly labelClassName: string;
    readonly placeholder: string;
    readonly externalError?: string;
    readonly onChange: (value: number | undefined) => void;
}

export function OptionalNumberField({
    id,
    label,
    value,
    minimum,
    maximum,
    integer = false,
    className,
    labelClassName,
    placeholder,
    externalError,
    onChange,
}: OptionalNumberFieldProps) {
    const [draft, setDraft] = React.useState(value === undefined ? '' : String(value));
    const parsed = draft.trim() === '' ? undefined : Number(draft);
    const invalid = draft.trim() !== '' && (
        !Number.isFinite(parsed)
        || (parsed as number) < minimum
        || (maximum !== undefined && (parsed as number) > maximum)
        || (integer && !Number.isSafeInteger(parsed))
    );
    const errorId = `${id}-error`;
    const displayedError = externalError ?? (invalid
        ? maximum !== undefined && integer
            ? `Enter a whole number from ${minimum} to ${maximum}.`
            : maximum !== undefined
                ? `Enter a number from ${minimum} to ${maximum}.`
                : integer
                    ? `Enter a whole number greater than or equal to ${minimum}.`
                    : `Enter a number greater than or equal to ${minimum}.`
        : undefined);

    React.useEffect(() => {
        setDraft(value === undefined ? '' : String(value));
    }, [value]);

    const commit = React.useCallback(() => {
        if (invalid) return;
        onChange(parsed);
    }, [invalid, onChange, parsed]);

    return (
        <div className="space-y-1">
            <Label htmlFor={id} className={labelClassName}>
                {label}
            </Label>
            <Input
                id={id}
                type="number"
                min={minimum}
                max={maximum}
                step={integer ? 1 : 'any'}
                className={className}
                value={draft}
                placeholder={placeholder}
                aria-invalid={invalid || externalError !== undefined}
                aria-describedby={displayedError ? errorId : undefined}
                onChange={event => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={event => {
                    if (event.key === 'Enter') {
                        event.currentTarget.blur();
                    }
                    if (event.key === 'Escape') {
                        setDraft(value === undefined ? '' : String(value));
                        event.currentTarget.blur();
                    }
                }}
            />
            {displayedError && (
                <p id={errorId} className="text-xs text-destructive">
                    {externalError ?? (maximum !== undefined && integer ? (
                        <Trans>Enter a whole number from {minimum} to {maximum}.</Trans>
                    ) : maximum !== undefined ? (
                        <Trans>Enter a number from {minimum} to {maximum}.</Trans>
                    ) : integer ? (
                        <Trans>Enter a whole number greater than or equal to {minimum}.</Trans>
                    ) : (
                        <Trans>Enter a number greater than or equal to {minimum}.</Trans>
                    ))}
                </p>
            )}
        </div>
    );
}

export function ExecutionContextFields<TContext extends ExecutionContextValue>({
    context,
    onChange,
    allowPipelineDefaults = false,
    showIdempotencyKey = false,
    showExecutionChannel = false,
    showThroughput = false,
    errors = {},
    compact = false,
}: ExecutionContextFieldsProps<TContext>) {
    const { t } = useLingui();
    const { channels, activeChannel, isLoading: channelsLoading } = useChannel();
    const { options: channelStrategies, isLoading: channelStrategiesLoading } =
        useOptionValues('channelStrategies');
    const { options: validationStrictnesses, isLoading: validationStrictnessesLoading } =
        useOptionValues('validationStrictnesses');
    const idPrefix = React.useId();
    const ids = {
        channelStrategy: `${idPrefix}-channel-strategy`,
        executionChannel: `${idPrefix}-execution-channel`,
        validationMode: `${idPrefix}-validation-mode`,
        idempotencyKey: `${idPrefix}-idempotency-key`,
        batchSize: `${idPrefix}-batch-size`,
        concurrency: `${idPrefix}-concurrency`,
        rateLimit: `${idPrefix}-rate-limit`,
    } as const;

    const updateField = React.useCallback(<TKey extends keyof ExecutionContextValue>(
        key: TKey,
        value: ExecutionContextValue[TKey],
    ) => {
        const next = { ...context } as unknown as Record<string, unknown>;
        if (value === undefined) {
            delete next[String(key)];
        } else {
            next[String(key)] = value;
        }
        onChange(next as TContext);
    }, [context, onChange]);

    const updateThroughput = React.useCallback((
        key: keyof Throughput,
        value: number | undefined,
    ) => {
        const throughput: Record<string, unknown> = {
            ...context.throughput,
        };
        if (value === undefined) {
            delete throughput[String(key)];
        } else {
            throughput[String(key)] = value;
        }
        updateField(
            'throughput',
            Object.keys(throughput).length > 0 ? throughput as Throughput : undefined,
        );
    }, [context.throughput, updateField]);

    const labelClass = compact ? 'text-xs' : 'text-sm';
    const controlClass = compact ? 'h-8 text-xs' : undefined;
    const throughputPlaceholder = allowPipelineDefaults
        ? t`Pipeline default`
        : t`Runtime default`;
    const selectValue = (value: string | undefined, fallback: string) =>
        allowPipelineDefaults ? value ?? PIPELINE_DEFAULT : value ?? fallback;
    const selectUpdate = (value: string): string | undefined =>
        allowPipelineDefaults && value === PIPELINE_DEFAULT ? undefined : value;
    const selectedExecutionChannel = context.channel
        ? channels.find(channel => channel.token === context.channel)
        : activeChannel;
    const channelsSelectable = context.channelStrategy === 'EXPLICIT'
        || context.channelStrategy === 'MULTI'
        || (allowPipelineDefaults && context.channelStrategy === undefined);
    const fieldError = (...paths: string[]): string | undefined => {
        for (const path of paths) {
            const match = Object.entries(errors).find(([field]) => (
                field === path || field.endsWith(`.${path}`)
            ));
            if (match) return match[1];
        }
        return undefined;
    };
    const FieldError = ({ message }: { message: string | undefined }) => message ? (
        <p className="text-xs text-destructive">{message}</p>
    ) : null;

    return (
        <div className={compact ? 'space-y-3' : 'space-y-4'}>
            <div>
                <div className="space-y-1">
                    <Label htmlFor={ids.validationMode} className={labelClass}>
                        <Trans>Validation strictness</Trans>
                    </Label>
                    <Select
                        disabled={validationStrictnessesLoading}
                        value={selectValue(context.validationMode, 'STRICT')}
                        onValueChange={value => updateField(
                            'validationMode',
                            selectUpdate(value) as ValidationModeType | undefined,
                        )}
                    >
                        <SelectTrigger id={ids.validationMode} className={controlClass}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {allowPipelineDefaults && (
                                <SelectItem value={PIPELINE_DEFAULT}>
                                    <Trans>Use pipeline default</Trans>
                                </SelectItem>
                            )}
                            {validationStrictnesses.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FieldError message={fieldError('validationMode')} />
                </div>
            </div>

            {showExecutionChannel && (
                <div className="space-y-1">
                    <Label htmlFor={ids.executionChannel} className={labelClass}>
                        <Trans>Execution channel</Trans>
                    </Label>
                    <Select
                        disabled={channelsLoading}
                        value={context.channel ?? ACTIVE_CHANNEL}
                        onValueChange={value => updateField(
                            'channel',
                            value === ACTIVE_CHANNEL ? undefined : value,
                        )}
                    >
                        <SelectTrigger id={ids.executionChannel} className={controlClass}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ACTIVE_CHANNEL}>
                                <Trans>Use active channel</Trans>
                                {activeChannel?.code ? ` (${activeChannel.code})` : ''}
                            </SelectItem>
                            {channels.map(channel => (
                                <SelectItem key={channel.id} value={channel.token}>
                                    {channel.code}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FieldError message={fieldError('channel')} />
                </div>
            )}

            <div className="space-y-1">
                <Label htmlFor={ids.channelStrategy} className={labelClass}>
                    <Trans>Channel strategy</Trans>
                </Label>
                <Select
                    disabled={channelStrategiesLoading}
                    value={selectValue(context.channelStrategy, 'INHERIT')}
                    onValueChange={value => {
                        const channelStrategy = selectUpdate(value) as ChannelStrategy | undefined;
                        const next = { ...context } as unknown as Record<string, unknown>;
                        if (channelStrategy === undefined) {
                            delete next.channelStrategy;
                        } else {
                            next.channelStrategy = channelStrategy;
                        }
                        if (channelStrategy === 'INHERIT') {
                            delete next.channelIds;
                        }
                        onChange(next as TContext);
                    }}
                >
                    <SelectTrigger id={ids.channelStrategy} className={controlClass}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {allowPipelineDefaults && (
                            <SelectItem value={PIPELINE_DEFAULT}>
                                <Trans>Use pipeline default</Trans>
                            </SelectItem>
                        )}
                        {channelStrategies.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <FieldError message={fieldError('channelStrategy')} />
            </div>

            <fieldset className="space-y-1">
                <legend className={labelClass}>
                    <Trans>Channels</Trans>
                </legend>
                {channelsSelectable ? (
                    <ChannelSelector<true>
                        multiple={true}
                        value={context.channelIds ?? []}
                        onChange={channelIds => updateField(
                            'channelIds',
                            channelIds.length === 0
                                ? undefined
                                : channelIds,
                        )}
                    />
                ) : (
                    <p className="rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">
                        <Trans>The active execution channel is inherited.</Trans>
                    </p>
                )}
                <p className="text-xs text-muted-foreground">
                    <Trans>Required when the channel strategy is explicit or multi-channel.</Trans>
                </p>
                <FieldError message={fieldError('channelIds')} />
            </fieldset>

            <fieldset className="space-y-1">
                <legend className={labelClass}>
                    <Trans>Content language</Trans>
                </legend>
                <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                        <LanguageSelector<false>
                            multiple={false}
                            availableLanguageCodes={selectedExecutionChannel?.availableLanguageCodes ?? undefined}
                            value={context.contentLanguage ?? ''}
                            onChange={contentLanguage => updateField(
                                'contentLanguage',
                                contentLanguage || undefined,
                            )}
                        />
                    </div>
                    {context.contentLanguage && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => updateField('contentLanguage', undefined)}
                            aria-label={t`Use inherited content language`}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
                <FieldError message={fieldError('contentLanguage')} />
            </fieldset>

            {showIdempotencyKey && (
                <div className="space-y-1">
                    <Label htmlFor={ids.idempotencyKey} className={labelClass}>
                        <Trans>Idempotency key field</Trans>
                    </Label>
                    <Input
                        id={ids.idempotencyKey}
                        className={controlClass}
                        value={context.idempotencyKeyField ?? ''}
                        onChange={event => updateField(
                            'idempotencyKeyField',
                            event.target.value.trim() || undefined,
                        )}
                        placeholder={t`Record field path`}
                    />
                    <FieldError message={fieldError('idempotencyKeyField')} />
                </div>
            )}

            {showThroughput && (
                <fieldset className="space-y-2 rounded-md border p-3">
                    <legend className={`${labelClass} px-1 font-medium`}>
                        {allowPipelineDefaults ? (
                            <Trans>Throughput overrides</Trans>
                        ) : (
                            <Trans>Throughput</Trans>
                        )}
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-3">
                        <OptionalNumberField
                            id={ids.batchSize}
                            label={<Trans>Batch size</Trans>}
                            value={context.throughput?.batchSize}
                            minimum={THROUGHPUT_LIMITS.MIN_BATCH_SIZE}
                            maximum={THROUGHPUT_LIMITS.MAX_BATCH_SIZE}
                            integer={true}
                            className={controlClass}
                            labelClassName={labelClass}
                            placeholder={throughputPlaceholder}
                            externalError={fieldError('throughput.batchSize')}
                            onChange={value => updateThroughput('batchSize', value)}
                        />
                        <OptionalNumberField
                            id={ids.concurrency}
                            label={<Trans>Concurrency</Trans>}
                            value={context.throughput?.concurrency}
                            minimum={PARALLEL_EXECUTION.MIN_CONCURRENT_STEPS}
                            maximum={PARALLEL_EXECUTION.MAX_CONCURRENT_STEPS}
                            integer={true}
                            className={controlClass}
                            labelClassName={labelClass}
                            placeholder={throughputPlaceholder}
                            externalError={fieldError('throughput.concurrency')}
                            onChange={value => updateThroughput('concurrency', value)}
                        />
                        <OptionalNumberField
                            id={ids.rateLimit}
                            label={<Trans>Rate limit</Trans>}
                            value={context.throughput?.rateLimitRps}
                            minimum={THROUGHPUT_LIMITS.MIN_RATE_LIMIT_RPS}
                            maximum={THROUGHPUT_LIMITS.MAX_RATE_LIMIT_RPS}
                            className={controlClass}
                            labelClassName={labelClass}
                            placeholder={throughputPlaceholder}
                            externalError={fieldError('throughput.rateLimitRps')}
                            onChange={value => updateThroughput('rateLimitRps', value)}
                        />
                    </div>
                </fieldset>
            )}
        </div>
    );
}
