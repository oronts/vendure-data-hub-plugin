import React from 'react';
import { Switch, Input, Label } from '@vendure/dashboard';
import type { Throughput } from '../../../types';
import { STEP_CONFIG_DEFAULTS } from '../../../constants';

export interface ThroughputSettingsComponentProps {
    readonly async?: boolean;
    readonly throughput?: Throughput;
    readonly onChange: (async: boolean | undefined, throughput: Throughput | undefined) => void;
    readonly defaultExpanded?: boolean;
}

export function ThroughputSettingsComponent({
    async,
    throughput,
    onChange,
    defaultExpanded = false,
}: ThroughputSettingsComponentProps) {
    const [expanded, setExpanded] = React.useState(defaultExpanded);

    return (
        <div className="border-t pt-3">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                aria-expanded={expanded}
                aria-label="Toggle advanced settings"
            >
                <span>{expanded ? '▼' : '▶'}</span>
                <span>Advanced Settings</span>
            </button>

            {expanded && (
                <div className="mt-3 space-y-3 pl-4">
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={Boolean(async)}
                            onCheckedChange={(v) => onChange(v || undefined, throughput)}
                        />
                        <Label className="text-sm">Run asynchronously (background job)</Label>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label className="text-sm text-muted-foreground">Batch Size</Label>
                            <Input
                                type="number"
                                value={throughput?.batchSize ?? ''}
                                onChange={(e) => {
                                    const val = e.target.value ? Number(e.target.value) : undefined;
                                    onChange(async, { ...throughput, batchSize: val });
                                }}
                                placeholder={String(STEP_CONFIG_DEFAULTS.THROUGHPUT_BATCH_SIZE)}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-sm text-muted-foreground">Rate Limit (req/s)</Label>
                            <Input
                                type="number"
                                value={throughput?.rateLimitRps ?? ''}
                                onChange={(e) => {
                                    const val = e.target.value ? Number(e.target.value) : undefined;
                                    onChange(async, { ...throughput, rateLimitRps: val });
                                }}
                                placeholder={String(STEP_CONFIG_DEFAULTS.THROUGHPUT_CONCURRENCY)}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
