import type { ImportConfiguration } from './types';
import { IMPORT_WIZARD_TRIGGERS, TRIGGER_TYPES } from '../../../constants';
import { WizardStepContainer } from '../shared';
import { TriggerSelector, ScheduleConfig, WebhookConfig } from '../../shared/wizard-trigger';
import { STEP_CONTENT } from './constants';

interface TriggerStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function TriggerStep({ config, updateConfig, errors = {} }: TriggerStepProps) {
    const trigger = config.trigger!;

    const handleTriggerTypeChange = (type: string) => {
        updateConfig({ trigger: { ...trigger, type: type as typeof trigger.type } });
    };

    const handleCronChange = (cron: string) => {
        updateConfig({ trigger: { ...trigger, cron } });
    };

    const handleWebhookPathChange = (webhookPath: string) => {
        updateConfig({ trigger: { ...trigger, webhookPath } });
    };

    return (
        <WizardStepContainer
            title={STEP_CONTENT.trigger.title}
            description={STEP_CONTENT.trigger.description}
        >
            <TriggerSelector
                options={IMPORT_WIZARD_TRIGGERS}
                value={trigger.type}
                onChange={handleTriggerTypeChange}
            />

            {trigger.type === TRIGGER_TYPES.SCHEDULE && (
                <ScheduleConfig
                    cron={trigger.cron ?? ''}
                    onChange={handleCronChange}
                />
            )}

            {trigger.type === TRIGGER_TYPES.WEBHOOK && (
                <WebhookConfig
                    webhookPath={trigger.webhookPath ?? ''}
                    onChange={handleWebhookPathChange}
                />
            )}
        </WizardStepContainer>
    );
}
