/**
 * Export Wizard - Trigger Step Component
 * Handles trigger, schedule, and options configuration
 */

import * as React from 'react';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
} from '@vendure/dashboard';
import {
    Play,
    Clock,
    Zap,
    Webhook,
} from 'lucide-react';
import { SCHEDULE_PRESETS } from './constants';
import type { ExportConfiguration, ExportTriggerType, CompressionType } from './types';

interface TriggerStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

const TRIGGER_TYPES = [
    { id: 'manual', label: 'Manual', icon: Play },
    { id: 'schedule', label: 'Scheduled', icon: Clock },
    { id: 'event', label: 'On Event', icon: Zap },
    { id: 'webhook', label: 'Webhook', icon: Webhook },
];

export function TriggerStep({ config, updateConfig }: TriggerStepProps) {
    const trigger = config.trigger ?? { type: 'manual' };
    const options = config.options ?? {
        batchSize: 1000,
        includeMetadata: false,
        compression: 'none',
        notifyOnComplete: true,
        retryOnFailure: true,
        maxRetries: 3,
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 className="text-2xl font-semibold mb-2">Schedule & Options</h2>
                <p className="text-muted-foreground">
                    Configure when to run the export and additional options
                </p>
            </div>

            {/* Trigger Type */}
            <TriggerTypeCard trigger={trigger} updateConfig={updateConfig} />

            {/* Export Options */}
            <ExportOptionsCard options={options} updateConfig={updateConfig} />

            {/* Caching */}
            <CachingCard config={config} updateConfig={updateConfig} />
        </div>
    );
}

interface TriggerTypeCardProps {
    trigger: ExportConfiguration['trigger'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function TriggerTypeCard({ trigger, updateConfig }: TriggerTypeCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Trigger</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-4 gap-4">
                    {TRIGGER_TYPES.map(type => {
                        const Icon = type.icon;
                        const isSelected = trigger.type === type.id;

                        return (
                            <button
                                key={type.id}
                                className={`p-4 border rounded-lg text-center transition-all ${
                                    isSelected
                                        ? 'border-primary bg-primary/5'
                                        : 'hover:border-primary/50'
                                }`}
                                onClick={() => updateConfig({ trigger: { ...trigger, type: type.id as ExportTriggerType } })}
                            >
                                <Icon className={`w-6 h-6 mx-auto mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                                <div className="font-medium text-sm">{type.label}</div>
                            </button>
                        );
                    })}
                </div>

                {trigger.type === 'schedule' && (
                    <div className="pt-4 border-t">
                        <Label className="mb-2 block">Schedule (Cron)</Label>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {SCHEDULE_PRESETS.map(preset => (
                                <Button
                                    key={preset.cron}
                                    variant={trigger.cron === preset.cron ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => updateConfig({
                                        trigger: { ...trigger, cron: preset.cron },
                                    })}
                                >
                                    {preset.label}
                                </Button>
                            ))}
                        </div>
                        <Input
                            value={trigger.cron ?? ''}
                            onChange={e => updateConfig({
                                trigger: { ...trigger, cron: e.target.value },
                            })}
                            placeholder="0 0 * * *"
                            className="font-mono"
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

interface ExportOptionsCardProps {
    options: ExportConfiguration['options'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function ExportOptionsCard({ options, updateConfig }: ExportOptionsCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Export Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <Label>Batch Size</Label>
                        <Input
                            type="number"
                            value={options.batchSize}
                            onChange={e => updateConfig({
                                options: { ...options, batchSize: parseInt(e.target.value) || 1000 },
                            })}
                        />
                    </div>

                    <div>
                        <Label>Compression</Label>
                        <Select
                            value={options.compression ?? 'none'}
                            onValueChange={compression => updateConfig({
                                options: { ...options, compression: compression as CompressionType },
                            })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="gzip">GZIP</SelectItem>
                                <SelectItem value="zip">ZIP</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label>Max Retries</Label>
                        <Input
                            type="number"
                            value={options.maxRetries}
                            onChange={e => updateConfig({
                                options: { ...options, maxRetries: parseInt(e.target.value) || 3 },
                            })}
                        />
                    </div>
                </div>

                <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={options.includeMetadata}
                            onCheckedChange={includeMetadata => updateConfig({
                                options: { ...options, includeMetadata },
                            })}
                        />
                        <Label>Include metadata</Label>
                    </div>

                    <div className="flex items-center gap-2">
                        <Switch
                            checked={options.notifyOnComplete}
                            onCheckedChange={notifyOnComplete => updateConfig({
                                options: { ...options, notifyOnComplete },
                            })}
                        />
                        <Label>Notify on complete</Label>
                    </div>

                    <div className="flex items-center gap-2">
                        <Switch
                            checked={options.retryOnFailure}
                            onCheckedChange={retryOnFailure => updateConfig({
                                options: { ...options, retryOnFailure },
                            })}
                        />
                        <Label>Retry on failure</Label>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

interface CachingCardProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function CachingCard({ config, updateConfig }: CachingCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Caching</CardTitle>
                <CardDescription>Cache export results for faster delivery</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                    <Switch
                        checked={config.caching?.enabled ?? false}
                        onCheckedChange={enabled => updateConfig({
                            caching: { ...config.caching, enabled, ttl: config.caching?.ttl ?? 3600 },
                        })}
                    />
                    <Label>Enable caching</Label>
                </div>

                {config.caching?.enabled && (
                    <div>
                        <Label>Cache TTL (seconds)</Label>
                        <Input
                            type="number"
                            value={config.caching.ttl}
                            onChange={e => updateConfig({
                                caching: { ...config.caching!, ttl: parseInt(e.target.value) || 3600 },
                            })}
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default TriggerStep;
