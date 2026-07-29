import React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import { STEP_CONFIG_DEFAULTS } from '../../../constants';
import { useOptionValues } from '../../../hooks/api/use-config-options';

export interface RetrySettings {
    maxRetries?: number;
    retryDelayMs?: number;
    backoff?: 'FIXED' | 'EXPONENTIAL';
}

export interface RetrySettingsComponentProps {
    readonly retrySettings?: RetrySettings;
    readonly onChange: (retrySettings: RetrySettings | undefined) => void;
    readonly defaultExpanded?: boolean;
}

export function RetrySettingsComponent({
    retrySettings,
    onChange,
    defaultExpanded = false,
}: RetrySettingsComponentProps) {
    const { t } = useLingui();
    const { options: backoffStrategies } = useOptionValues('backoffStrategies');
    const [expanded, setExpanded] = React.useState(defaultExpanded);
    const fieldIdPrefix = React.useId();
    const maxRetriesId = `${fieldIdPrefix}-max-retries`;
    const retryDelayId = `${fieldIdPrefix}-retry-delay`;
    const backoffId = `${fieldIdPrefix}-backoff`;

    return (
        <div className="border-t pt-3">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                aria-label={expanded ? t`Collapse retry settings` : t`Expand retry settings`}
                data-testid="datahub-retry-settings-toggle"
            >
                <span>{expanded ? '\u25BC' : '\u25B6'}</span>
                <span><Trans>Retry settings</Trans></span>
            </button>

            {expanded && (
                <div className="mt-3 space-y-3 pl-4">
                    <div className="space-y-1">
                        <Label htmlFor={maxRetriesId} className="text-sm text-muted-foreground">
                            <Trans>Maximum retries</Trans>
                        </Label>
                        <Input
                            id={maxRetriesId}
                            type="number"
                            value={retrySettings?.maxRetries ?? ''}
                            onChange={(e) => {
                                const val = e.target.value ? Number(e.target.value) : undefined;
                                onChange({ ...retrySettings, maxRetries: val });
                            }}
                            placeholder={String(STEP_CONFIG_DEFAULTS.RETRY_MAX_ATTEMPTS)}
                            min={0}
                            data-testid="datahub-retry-max-retries-input"
                        />
                        <p className="text-xs text-muted-foreground">
                            <Trans>Maximum number of retry attempts per record (0 = no retries)</Trans>
                        </p>
                    </div>

                    <div className="space-y-1">
                        <Label htmlFor={retryDelayId} className="text-sm text-muted-foreground">
                            <Trans>Retry delay (ms)</Trans>
                        </Label>
                        <Input
                            id={retryDelayId}
                            type="number"
                            value={retrySettings?.retryDelayMs ?? ''}
                            onChange={(e) => {
                                const val = e.target.value ? Number(e.target.value) : undefined;
                                onChange({ ...retrySettings, retryDelayMs: val });
                            }}
                            placeholder={String(STEP_CONFIG_DEFAULTS.RETRY_DELAY_MS)}
                            min={0}
                            data-testid="datahub-retry-delay-input"
                        />
                        <p className="text-xs text-muted-foreground">
                            <Trans>Delay in milliseconds between retry attempts</Trans>
                        </p>
                    </div>

                    <div className="space-y-1">
                        <Label htmlFor={backoffId} className="text-sm text-muted-foreground">
                            <Trans>Backoff strategy</Trans>
                        </Label>
                        <Select
                            value={retrySettings?.backoff ?? 'FIXED'}
                            onValueChange={(v) => {
                                onChange({ ...retrySettings, backoff: v as RetrySettings['backoff'] });
                            }}
                        >
                            <SelectTrigger
                                id={backoffId}
                                className="w-full"
                                data-testid="datahub-retry-backoff-select"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {backoffStrategies.map((bs) => (
                                    <SelectItem key={bs.value} value={bs.value}>
                                        {bs.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            <Trans>Fixed uses a constant delay; exponential doubles the delay after each retry.</Trans>
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
