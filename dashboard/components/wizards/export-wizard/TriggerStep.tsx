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
import { TRIGGER_TYPE, UI_DEFAULTS, COMPRESSION_TYPE, LOADING_STATE_TYPE } from '../../../constants';
import { useOptionValues } from '../../../hooks/api/use-config-options';
import { useTriggerTypes } from '../../../hooks';
import { WizardStepContainer } from '../shared';
import { TriggerSelector, TriggerSchemaFields } from '../../shared/wizard-trigger';
import { LoadingState } from '../../shared/feedback';
import { STEP_CONTENT, DEFAULT_EXPORT_OPTIONS } from './constants';
import type { ExportConfiguration, ExportTriggerType, CompressionType } from './types';

interface TriggerStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function TriggerStep({ config, updateConfig, errors = {} }: TriggerStepProps) {
    const trigger = config.trigger ?? { type: TRIGGER_TYPE.MANUAL };
    const options = config.options ?? { ...DEFAULT_EXPORT_OPTIONS };

    const handleTriggerTypeChange = (type: string) => {
        updateConfig({ trigger: { ...trigger, type: type as ExportTriggerType } });
    };

    return (
        <WizardStepContainer
            title={STEP_CONTENT.trigger.title}
            description={STEP_CONTENT.trigger.description}
        >
            <TriggerCard
                trigger={trigger}
                updateConfig={updateConfig}
                onTriggerTypeChange={handleTriggerTypeChange}
            />
            <ExportOptionsCard options={options} updateConfig={updateConfig} />
            <CachingCard config={config} updateConfig={updateConfig} />
        </WizardStepContainer>
    );
}

interface TriggerCardProps {
    trigger: ExportConfiguration['trigger'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    onTriggerTypeChange: (type: string) => void;
}

function TriggerCard({ trigger, updateConfig, onTriggerTypeChange }: TriggerCardProps) {
    const { exportWizardTriggers, triggerSchemas, isLoading } = useTriggerTypes();
    const currentSchema = triggerSchemas.find(s => s.value === trigger.type);

    const handleFieldChange = (key: string, value: unknown) => {
        updateConfig({ trigger: { ...trigger, [key]: value } });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Trigger</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <TriggerSelector
                    options={exportWizardTriggers}
                    value={trigger.type}
                    onChange={onTriggerTypeChange}
                />

                {currentSchema && currentSchema.fields.length > 0 ? (
                    <div className="pt-4 border-t">
                        <TriggerSchemaFields
                            fields={currentSchema.fields}
                            values={trigger as Record<string, unknown>}
                            onChange={handleFieldChange}
                        />
                    </div>
                ) : isLoading && trigger.type !== TRIGGER_TYPE.MANUAL ? (
                    <div className="pt-4 border-t">
                        <LoadingState type={LOADING_STATE_TYPE.FORM} rows={2} message="" />
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}

interface ExportOptionsCardProps {
    options: ExportConfiguration['options'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function ExportOptionsCard({ options, updateConfig }: ExportOptionsCardProps) {
    const { options: compressionOptions } = useOptionValues('compressionTypes');
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
                                {compressionOptions.map(option => (
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
                            id="include-metadata"
                            checked={options.includeMetadata}
                            onCheckedChange={includeMetadata => updateConfig({
                                options: { ...options, includeMetadata },
                            })}
                        />
                        <Label htmlFor="include-metadata">Include metadata</Label>
                    </div>

                    <div className="flex items-center gap-2">
                        <Switch
                            id="notify-on-complete"
                            checked={options.notifyOnComplete}
                            onCheckedChange={notifyOnComplete => updateConfig({
                                options: { ...options, notifyOnComplete },
                            })}
                        />
                        <Label htmlFor="notify-on-complete">Notify on complete</Label>
                    </div>

                    <div className="flex items-center gap-2">
                        <Switch
                            id="retry-on-failure"
                            checked={options.retryOnFailure}
                            onCheckedChange={retryOnFailure => updateConfig({
                                options: { ...options, retryOnFailure },
                            })}
                        />
                        <Label htmlFor="retry-on-failure">Retry on failure</Label>
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
