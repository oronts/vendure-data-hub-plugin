import type { ImportConfiguration } from './types';
import { TRIGGER_TYPE, LOADING_STATE_TYPE } from '../../../constants';
import { useTriggerTypes } from '../../../hooks';
import { WizardStepContainer } from '../shared';
import { TriggerSelector, TriggerSchemaFields } from '../../shared/wizard-trigger';
import { LoadingState } from '../../shared/feedback';
import { STEP_CONTENT } from './constants';

interface TriggerStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function TriggerStep({ config, updateConfig, errors = {} }: TriggerStepProps) {
    const trigger = config.trigger ?? { type: TRIGGER_TYPE.MANUAL };
    const { importWizardTriggers, triggerSchemas, isLoading } = useTriggerTypes();

    const currentSchema = triggerSchemas.find(s => s.value === trigger.type);

    const handleTriggerTypeChange = (type: string) => {
        updateConfig({ trigger: { ...trigger, type: type as typeof trigger.type } });
    };

    const handleFieldChange = (key: string, value: unknown) => {
        updateConfig({ trigger: { ...trigger, [key]: value } });
    };

    return (
        <WizardStepContainer
            title={STEP_CONTENT.trigger.title}
            description={STEP_CONTENT.trigger.description}
        >
            <TriggerSelector
                options={importWizardTriggers}
                value={trigger.type}
                onChange={handleTriggerTypeChange}
            />

            {currentSchema && currentSchema.fields.length > 0 ? (
                <TriggerSchemaFields
                    fields={currentSchema.fields}
                    values={trigger as Record<string, unknown>}
                    onChange={handleFieldChange}
                />
            ) : isLoading && trigger.type !== TRIGGER_TYPE.MANUAL ? (
                <LoadingState type={LOADING_STATE_TYPE.FORM} rows={2} message="" />
            ) : null}
        </WizardStepContainer>
    );
}
