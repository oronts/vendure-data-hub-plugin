import * as React from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { VENDURE_ENTITY_SCHEMAS } from '../../../../vendure-schemas/vendure-entity-schemas';
import { WIZARD_STEPS, EXPORT_STEP_ID } from './constants';
import { QUERY_LIMITS, BATCH_SIZES, UI_DEFAULTS, EXPORT_DEFAULTS, TRIGGER_TYPES, EXPORT_FORMAT, COMPRESSION_TYPE, TOAST_WIZARD } from '../../../constants';
import type { ExportWizardProps, ExportConfiguration, ExportField } from './types';
import { SourceStep } from './SourceStep';
import { FieldsStep } from './FieldsStep';
import { FormatStep } from './FormatStep';
import { DestinationStep } from './DestinationStep';
import { TriggerStep } from './TriggerStep';
import { ReviewStep } from './ReviewStep';
import { validateExportWizardStep } from '../../../utils/form-validation';
import { WizardProgressBar, WizardFooter, ValidationErrorDisplay } from '../../shared';

export function ExportWizard({ onComplete, onCancel, initialConfig }: ExportWizardProps) {
    const [currentStep, setCurrentStep] = React.useState(0);
    const [config, setConfig] = React.useState<Partial<ExportConfiguration>>(initialConfig ?? {
        name: '',
        sourceEntity: '',
        sourceQuery: { type: 'all', limit: QUERY_LIMITS.EXPORT_DEFAULT, orderBy: 'id', orderDirection: 'ASC' },
        filters: [],
        fields: [],
        format: { type: EXPORT_FORMAT.CSV, options: { delimiter: ',', includeHeaders: true } },
        destination: { type: 'file', fileConfig: { directory: EXPORT_DEFAULTS.DIRECTORY, filename: EXPORT_DEFAULTS.FILENAME } },
        trigger: { type: TRIGGER_TYPES.MANUAL },
        options: {
            batchSize: BATCH_SIZES.EXPORT_DEFAULT,
            includeMetadata: false,
            compression: COMPRESSION_TYPE.NONE,
            notifyOnComplete: true,
            retryOnFailure: true,
            maxRetries: UI_DEFAULTS.DEFAULT_MAX_RETRIES,
        },
    });

    const [stepErrors, setStepErrors] = React.useState<Record<string, string>>({});
    const [attemptedNext, setAttemptedNext] = React.useState(false);

    const updateConfig = React.useCallback((updates: Partial<ExportConfiguration>) => {
        setConfig(prev => ({ ...prev, ...updates }));
        setStepErrors({});
        setAttemptedNext(false);
    }, []);

    // Memoize validation based on specific config properties to prevent unnecessary recalculations
    const configSignature = React.useMemo(
        () => JSON.stringify([config.sourceEntity, config.fields?.length, config.format?.type, config.destination?.type, config.name]),
        [config.sourceEntity, config.fields?.length, config.format?.type, config.destination?.type, config.name],
    );

    const validateCurrentStep = React.useCallback(() => {
        const stepId = WIZARD_STEPS[currentStep].id;
        const validation = validateExportWizardStep(stepId, config);
        return validation;
    }, [currentStep, configSignature]);

    const { canProceed } = React.useMemo(() => {
        const validation = validateCurrentStep();
        return {
            canProceed: validation.isValid,
        };
    }, [validateCurrentStep]);

    // Track previous sourceEntity to detect changes and avoid re-running on same value
    const prevSourceEntityRef = React.useRef<string | undefined>(undefined);

    React.useEffect(() => {
        // Only run when sourceEntity actually changes, not on every render
        if (config.sourceEntity && config.sourceEntity !== prevSourceEntityRef.current) {
            prevSourceEntityRef.current = config.sourceEntity;
            const schema = VENDURE_ENTITY_SCHEMAS[config.sourceEntity];
            if (schema) {
                const fields: ExportField[] = Object.entries(schema.fields).map(([name]) => ({
                    sourceField: name,
                    outputName: name,
                    include: true,
                }));
                // Use setConfig directly to avoid infinite loop from updateConfig in deps
                setConfig(prev => ({ ...prev, fields }));
                setStepErrors({});
                setAttemptedNext(false);
            }
        }
    }, [config.sourceEntity]);

    const handleNext = React.useCallback(() => {
        setAttemptedNext(true);
        const validation = validateCurrentStep();

        if (!validation.isValid) {
            setStepErrors(validation.errorsByField);
            const firstError = validation.errors[0];
            if (firstError) {
                toast.error(firstError.message);
            }
            return;
        }

        if (currentStep < WIZARD_STEPS.length - 1) {
            setAttemptedNext(false);
            setStepErrors({});
            setCurrentStep(prev => prev + 1);
        }
    }, [validateCurrentStep, currentStep]);

    const handleBack = React.useCallback(() => {
        if (currentStep > 0) {
            setAttemptedNext(false);
            setStepErrors({});
            setCurrentStep(prev => prev - 1);
        }
    }, [currentStep]);

    const handleComplete = React.useCallback(() => {
        if (!config.name) {
            toast.error(TOAST_WIZARD.EXPORT_NAME_REQUIRED);
            return;
        }
        onComplete(config as ExportConfiguration);
    }, [config, onComplete]);

    return (
        <div className="flex flex-col h-full">
            <WizardProgressBar
                steps={WIZARD_STEPS}
                currentStep={currentStep}
                onStepClick={setCurrentStep}
            />

            <div className="flex-1 overflow-auto p-6">
                <ValidationErrorDisplay errors={stepErrors} show={attemptedNext} />

                {WIZARD_STEPS[currentStep].id === EXPORT_STEP_ID.SOURCE && (
                    <SourceStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}

                {WIZARD_STEPS[currentStep].id === EXPORT_STEP_ID.FIELDS && (
                    <FieldsStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}

                {WIZARD_STEPS[currentStep].id === EXPORT_STEP_ID.FORMAT && (
                    <FormatStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}

                {WIZARD_STEPS[currentStep].id === EXPORT_STEP_ID.DESTINATION && (
                    <DestinationStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}

                {WIZARD_STEPS[currentStep].id === EXPORT_STEP_ID.TRIGGER && (
                    <TriggerStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}

                {WIZARD_STEPS[currentStep].id === EXPORT_STEP_ID.REVIEW && (
                    <ReviewStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}
            </div>

            <WizardFooter
                currentStep={currentStep}
                totalSteps={WIZARD_STEPS.length}
                canProceed={canProceed}
                onBack={handleBack}
                onNext={handleNext}
                onComplete={handleComplete}
                onCancel={onCancel}
                completeLabel="Create Export"
                completeIcon={Download}
            />
        </div>
    );
}
