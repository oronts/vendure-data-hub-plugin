import { useLingui } from '@lingui/react/macro';
import type { ImportConfiguration } from './types';
import { TRIGGER_TYPE, LOADING_STATE_TYPE } from '../../../constants';
import { useTriggerTypes } from '../../../hooks';
import { useConfigOptions } from '../../../hooks/api/use-config-options';
import { WizardStepContainer } from '../shared';
import { TriggerSelector, TriggerSchemaFields } from '../../shared/wizard-trigger';
import { LoadingState } from '../../shared/feedback';
import { applyTriggerSchemaDefaults } from '../../../utils/trigger-schema';

interface TriggerStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

export function TriggerStep({ config, updateConfig }: TriggerStepProps) {
    const { t } = useLingui();
    const trigger = config.trigger ?? { type: TRIGGER_TYPE.MANUAL };
    const { importWizardTriggers, triggerSchemas, isLoading } = useTriggerTypes();
    const { data: optionSources } = useConfigOptions();

    const currentSchema = triggerSchemas.find(s => s.value === trigger.type);

    const handleTriggerTypeChange = (type: string) => {
        const schema = triggerSchemas.find(item => item.value === type);
        updateConfig({
            trigger: applyTriggerSchemaDefaults(
                trigger as unknown as Record<string, unknown>,
                type,
                schema,
            ) as unknown as ImportConfiguration['trigger'],
        });
    };

    const handleFieldChange = (key: string, value: unknown) => {
        updateConfig({ trigger: { ...trigger, [key]: value } });
    };

    return (
        <WizardStepContainer
            title={t`Choose a trigger`}
            description={t`Select when this import should run.`}
        >
            <TriggerSelector
                options={importWizardTriggers}
                value={trigger.type}
                onChange={handleTriggerTypeChange}
            />

            {currentSchema && currentSchema.fields.length > 0 ? (
                <TriggerSchemaFields
                    fields={currentSchema.fields}
                    values={{ ...trigger }}
                    onChange={handleFieldChange}
                    optionSources={optionSources}
                />
            ) : isLoading && trigger.type !== TRIGGER_TYPE.MANUAL ? (
                <LoadingState type={LOADING_STATE_TYPE.FORM} rows={2} message="" />
            ) : null}
        </WizardStepContainer>
    );
}
