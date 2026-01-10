/**
 * Import Wizard - Trigger Step Component
 * Handles trigger and schedule configuration
 */

import * as React from 'react';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
} from '@vendure/dashboard';
import {
    Play,
    Clock,
    Webhook,
    Eye,
} from 'lucide-react';
import type { ImportConfiguration, TriggerConfig } from './types';

/** Trigger type extracted from TriggerConfig */
type TriggerType = TriggerConfig['type'];

interface TriggerStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

const TRIGGER_TYPES = [
    { id: 'manual', label: 'Manual', icon: Play, desc: 'Run manually from dashboard' },
    { id: 'schedule', label: 'Scheduled', icon: Clock, desc: 'Run on a schedule (cron)' },
    { id: 'webhook', label: 'Webhook', icon: Webhook, desc: 'Trigger via HTTP webhook' },
    { id: 'file', label: 'File Watch', icon: Eye, desc: 'Watch for new files' },
];

const SCHEDULE_PRESETS = [
    { label: 'Every hour', cron: '0 * * * *' },
    { label: 'Every 6 hours', cron: '0 */6 * * *' },
    { label: 'Daily at midnight', cron: '0 0 * * *' },
    { label: 'Daily at 6 AM', cron: '0 6 * * *' },
    { label: 'Weekly (Sunday)', cron: '0 0 * * 0' },
    { label: 'Monthly (1st)', cron: '0 0 1 * *' },
];

export function TriggerStep({ config, updateConfig }: TriggerStepProps) {
    const trigger = config.trigger!;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 className="text-2xl font-semibold mb-2">Trigger & Schedule</h2>
                <p className="text-muted-foreground">
                    Configure when and how the import should run
                </p>
            </div>

            {/* Trigger Type Selection */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {TRIGGER_TYPES.map(type => {
                    const Icon = type.icon;
                    const isSelected = trigger.type === type.id;

                    return (
                        <button
                            key={type.id}
                            className={`p-4 border rounded-lg text-left transition-all ${
                                isSelected
                                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                    : 'hover:border-primary/50'
                            }`}
                            onClick={() => updateConfig({ trigger: { ...trigger, type: type.id as TriggerType } })}
                        >
                            <Icon className={`w-8 h-8 mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                            <div className="font-medium">{type.label}</div>
                            <div className="text-xs text-muted-foreground">{type.desc}</div>
                        </button>
                    );
                })}
            </div>

            {/* Schedule Configuration */}
            {trigger.type === 'schedule' && (
                <ScheduleConfig trigger={trigger} updateConfig={updateConfig} />
            )}

            {/* Webhook Configuration */}
            {trigger.type === 'webhook' && (
                <WebhookConfig trigger={trigger} updateConfig={updateConfig} />
            )}
        </div>
    );
}

interface ScheduleConfigProps {
    trigger: ImportConfiguration['trigger'];
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

function ScheduleConfig({ trigger, updateConfig }: ScheduleConfigProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Schedule Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label className="mb-2 block">Quick Presets</Label>
                    <div className="flex flex-wrap gap-2">
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
                </div>

                <div>
                    <Label>Cron Expression</Label>
                    <Input
                        value={trigger.cron ?? ''}
                        onChange={e => updateConfig({
                            trigger: { ...trigger, cron: e.target.value },
                        })}
                        placeholder="0 0 * * *"
                        className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Format: minute hour day month weekday
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

interface WebhookConfigProps {
    trigger: ImportConfiguration['trigger'];
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

function WebhookConfig({ trigger, updateConfig }: WebhookConfigProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Webhook Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label>Webhook Path</Label>
                    <div className="flex gap-2">
                        <span className="flex items-center px-3 bg-muted rounded-l-lg text-sm text-muted-foreground">
                            /webhooks/data-hub/
                        </span>
                        <Input
                            value={trigger.webhookPath ?? ''}
                            onChange={e => updateConfig({
                                trigger: { ...trigger, webhookPath: e.target.value },
                            })}
                            placeholder="my-import"
                            className="flex-1"
                        />
                    </div>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                    <div className="text-sm font-medium mb-2">Webhook URL</div>
                    <code className="text-xs break-all">
                        https://your-domain.com/webhooks/data-hub/{trigger.webhookPath || 'my-import'}
                    </code>
                </div>
            </CardContent>
        </Card>
    );
}

export default TriggerStep;
