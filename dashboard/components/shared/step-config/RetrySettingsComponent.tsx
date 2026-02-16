import React from 'react';
import {
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';

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

const BACKOFF_STRATEGIES = [
    { value: 'FIXED', label: 'Fixed Delay' },
    { value: 'EXPONENTIAL', label: 'Exponential Backoff' },
] as const;

export function RetrySettingsComponent({
    retrySettings,
    onChange,
    defaultExpanded = false,
}: RetrySettingsComponentProps) {
    const [expanded, setExpanded] = React.useState(defaultExpanded);

    return (
        <div className="border-t pt-3">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                data-testid="datahub-retry-settings-toggle"
            >
                <span>{expanded ? '\u25BC' : '\u25B6'}</span>
                <span>Retry Settings</span>
            </button>

            {expanded && (
                <div className="mt-3 space-y-3 pl-4">
                    <div className="space-y-1">
                        <Label className="text-sm text-muted-foreground">Max Retries</Label>
                        <Input
                            type="number"
                            value={retrySettings?.maxRetries ?? ''}
                            onChange={(e) => {
                                const val = e.target.value ? Number(e.target.value) : undefined;
                                onChange({ ...retrySettings, maxRetries: val });
                            }}
                            placeholder="3"
                            min={0}
                            data-testid="datahub-retry-max-retries-input"
                        />
                        <p className="text-xs text-muted-foreground">
                            Maximum number of retry attempts per record (0 = no retries)
                        </p>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-sm text-muted-foreground">Retry Delay (ms)</Label>
                        <Input
                            type="number"
                            value={retrySettings?.retryDelayMs ?? ''}
                            onChange={(e) => {
                                const val = e.target.value ? Number(e.target.value) : undefined;
                                onChange({ ...retrySettings, retryDelayMs: val });
                            }}
                            placeholder="1000"
                            min={0}
                            data-testid="datahub-retry-delay-input"
                        />
                        <p className="text-xs text-muted-foreground">
                            Delay in milliseconds between retry attempts
                        </p>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-sm text-muted-foreground">Backoff Strategy</Label>
                        <Select
                            value={retrySettings?.backoff ?? 'FIXED'}
                            onValueChange={(v) => {
                                onChange({ ...retrySettings, backoff: v as RetrySettings['backoff'] });
                            }}
                        >
                            <SelectTrigger className="w-full" data-testid="datahub-retry-backoff-select">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {BACKOFF_STRATEGIES.map((bs) => (
                                    <SelectItem key={bs.value} value={bs.value}>
                                        {bs.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            Fixed uses constant delay; Exponential doubles delay on each retry
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
