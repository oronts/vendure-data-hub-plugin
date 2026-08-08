import { Trans, useLingui } from '@lingui/react/macro';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
} from '@vendure/dashboard';
import {
    LOADING_STATE_TYPE,
    TRIGGER_TYPE,
    UI_DEFAULTS,
} from '../../../constants';
import { useConfigOptions } from '../../../hooks/api/use-config-options';
import { useTriggerTypes } from '../../../hooks';
import { WizardStepContainer } from '../shared';
import { TriggerSelector, TriggerSchemaFields } from '../../shared/wizard-trigger';
import { LoadingState } from '../../shared/feedback';
import { DEFAULT_EXPORT_OPTIONS } from './constants';
import type { ExportConfiguration } from './types';
import { applyTriggerSchemaDefaults } from '../../../utils/trigger-schema';

interface TriggerStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

export function TriggerStep({ config, updateConfig }: TriggerStepProps) {
    const { t } = useLingui();
    const trigger = config.trigger ?? { type: TRIGGER_TYPE.MANUAL };
    const options = config.options ?? { ...DEFAULT_EXPORT_OPTIONS };

    return (
        <WizardStepContainer
            title={t`Schedule & Options`}
            description={t`Configure when to run the export and additional options`}
        >
            <TriggerCard
                trigger={trigger}
                updateConfig={updateConfig}
            />
            <ExportOptionsCard options={options} updateConfig={updateConfig} />
        </WizardStepContainer>
    );
}

interface TriggerCardProps {
    trigger: ExportConfiguration['trigger'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function TriggerCard({ trigger, updateConfig }: TriggerCardProps) {
    const { exportWizardTriggers, triggerSchemas, isLoading } = useTriggerTypes();
    const { data: optionSources } = useConfigOptions();
    const currentSchema = triggerSchemas.find(s => s.value === trigger.type);

    const handleFieldChange = (key: string, value: unknown) => {
        updateConfig({ trigger: { ...trigger, [key]: value } });
    };

    const handleTriggerTypeChange = (type: string) => {
        const schema = triggerSchemas.find(item => item.value === type);
        updateConfig({
            trigger: applyTriggerSchemaDefaults(
                trigger as unknown as Record<string, unknown>,
                type,
                schema,
            ) as unknown as ExportConfiguration['trigger'],
        });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle><Trans>Trigger</Trans></CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <TriggerSelector
                    options={exportWizardTriggers}
                    value={trigger.type}
                    onChange={handleTriggerTypeChange}
                />

                {currentSchema && currentSchema.fields.length > 0 ? (
                    <div className="pt-4 border-t">
                        <TriggerSchemaFields
                            fields={currentSchema.fields}
                            values={{ ...trigger }}
                            onChange={handleFieldChange}
                            optionSources={optionSources}
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
    return (
        <Card>
            <CardHeader>
                <CardTitle><Trans>Export Options</Trans></CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
                    <div>
                        <Label htmlFor="export-batch-size">
                            <Trans>Batch Size</Trans>
                        </Label>
                        <Input
                            id="export-batch-size"
                            type="number"
                            value={options.batchSize}
                            onChange={e => updateConfig({
                                options: { ...options, batchSize: parseInt(e.target.value) || UI_DEFAULTS.EXPORT_BATCH_SIZE },
                            })}
                        />
                    </div>

                </div>
            </CardContent>
        </Card>
    );
}
