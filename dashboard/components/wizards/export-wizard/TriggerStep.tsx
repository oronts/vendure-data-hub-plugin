import {
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
import { EXPORT_WIZARD_TRIGGERS, TRIGGER_TYPES } from '../../../constants/triggers';
import { UI_DEFAULTS } from '../../../constants/editor';
import { COMPRESSION_OPTIONS, COMPRESSION_TYPE } from '../../../constants/wizard-options';
import { WizardStepContainer } from '../shared';
import { TriggerSelector, ScheduleConfig } from '../../shared/wizard-trigger';
import { STEP_CONTENT } from './constants';
import type { ExportConfiguration, ExportTriggerType, CompressionType } from './types';

interface TriggerStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function TriggerStep({ config, updateConfig, errors = {} }: TriggerStepProps) {
    const trigger = config.trigger ?? { type: TRIGGER_TYPES.MANUAL };
    const options = config.options ?? {
        batchSize: UI_DEFAULTS.EXPORT_BATCH_SIZE,
        includeMetadata: false,
        compression: COMPRESSION_TYPE.NONE,
        notifyOnComplete: true,
        retryOnFailure: true,
        maxRetries: UI_DEFAULTS.DEFAULT_MAX_RETRIES,
    };

    const handleTriggerTypeChange = (type: string) => {
        updateConfig({ trigger: { ...trigger, type: type as ExportTriggerType } });
    };

    const handleCronChange = (cron: string) => {
        updateConfig({ trigger: { ...trigger, cron } });
    };

    return (
        <WizardStepContainer
            title={STEP_CONTENT.trigger.title}
            description={STEP_CONTENT.trigger.description}
        >
            <TriggerCard
                trigger={trigger}
                onTriggerTypeChange={handleTriggerTypeChange}
                onCronChange={handleCronChange}
            />
            <ExportOptionsCard options={options} updateConfig={updateConfig} />
            <CachingCard config={config} updateConfig={updateConfig} />
        </WizardStepContainer>
    );
}

interface TriggerCardProps {
    trigger: ExportConfiguration['trigger'];
    onTriggerTypeChange: (type: string) => void;
    onCronChange: (cron: string) => void;
}

function TriggerCard({ trigger, onTriggerTypeChange, onCronChange }: TriggerCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Trigger</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <TriggerSelector
                    options={EXPORT_WIZARD_TRIGGERS}
                    value={trigger.type}
                    onChange={onTriggerTypeChange}
                />

                {trigger.type === TRIGGER_TYPES.SCHEDULE && (
                    <div className="pt-4 border-t">
                        <ScheduleConfig
                            cron={trigger.cron ?? ''}
                            onChange={onCronChange}
                            showCard={false}
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
                                options: { ...options, batchSize: parseInt(e.target.value) || UI_DEFAULTS.EXPORT_BATCH_SIZE },
                            })}
                        />
                    </div>

                    <div>
                        <Label>Compression</Label>
                        <Select
                            value={options.compression ?? COMPRESSION_TYPE.NONE}
                            onValueChange={compression => updateConfig({
                                options: { ...options, compression: compression as CompressionType },
                            })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {COMPRESSION_OPTIONS.map(option => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label>Max Retries</Label>
                        <Input
                            type="number"
                            value={options.maxRetries}
                            onChange={e => updateConfig({
                                options: { ...options, maxRetries: parseInt(e.target.value) || UI_DEFAULTS.DEFAULT_MAX_RETRIES },
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
                            caching: { ...config.caching, enabled, ttl: config.caching?.ttl ?? UI_DEFAULTS.DEFAULT_CACHE_TTL_SECONDS },
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
                                caching: { ...config.caching!, ttl: parseInt(e.target.value) || UI_DEFAULTS.DEFAULT_CACHE_TTL_SECONDS },
                            })}
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
