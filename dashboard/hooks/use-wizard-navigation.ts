import * as React from 'react';
import { toast } from 'sonner';
import type { WizardStep } from '../types/wizard';
import type { FormValidationResult } from '../utils/form-validation';

interface UseWizardNavigationOptions<TConfig> {
    steps: WizardStep[];
    initialConfig: TConfig;
    validateStep: (stepId: string, config: TConfig) => FormValidationResult;
    onComplete: (config: TConfig) => void;
    nameRequiredMessage: string;
    isSubmitting?: boolean;
}

export function useWizardNavigation<TConfig extends { name?: string }>({
    steps,
    initialConfig,
    validateStep,
    onComplete,
    nameRequiredMessage,
    isSubmitting,
}: UseWizardNavigationOptions<TConfig>) {
    const [config, setConfig] = React.useState<TConfig>(initialConfig);
    const [currentStep, setCurrentStep] = React.useState(0);
    const [stepErrors, setStepErrors] = React.useState<Record<string, string>>({});
    const [attemptedNext, setAttemptedNext] = React.useState(false);

    const updateConfig = React.useCallback((updates: Partial<TConfig>) => {
        setConfig(prev => ({ ...prev, ...updates }));
        setStepErrors({});
        setAttemptedNext(false);
    }, []);

    const validateCurrentStep = React.useCallback(() => {
        const stepId = steps[currentStep].id;
        return validateStep(stepId, config);
    }, [steps, currentStep, config, validateStep]);

    const canProceed = React.useMemo(() => {
        const validation = validateCurrentStep();
        return validation.isValid;
    }, [validateCurrentStep]);

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

        if (currentStep < steps.length - 1) {
            setAttemptedNext(false);
            setStepErrors({});
            setCurrentStep(prev => prev + 1);
        }
    }, [validateCurrentStep, currentStep, steps]);

    const handleBack = React.useCallback(() => {
        if (currentStep > 0) {
            setAttemptedNext(false);
            setStepErrors({});
            setCurrentStep(prev => prev - 1);
        }
    }, [currentStep]);

    const handleStepClick = React.useCallback((index: number) => {
        // Going backward is always allowed; going forward requires current step validation
        if (index > currentStep) {
            const validation = validateCurrentStep();
            if (!validation.isValid) {
                setAttemptedNext(true);
                setStepErrors(validation.errorsByField);
                const firstError = validation.errors[0];
                if (firstError) {
                    toast.error(firstError.message);
                }
                return;
            }
        }
        setAttemptedNext(false);
        setStepErrors({});
        setCurrentStep(index);
    }, [currentStep, validateCurrentStep]);

    const handleComplete = React.useCallback(() => {
        if (isSubmitting) return;

        const validation = validateCurrentStep();
        if (!validation.isValid) {
            setAttemptedNext(true);
            setStepErrors(validation.errorsByField);
            const firstError = validation.errors[0];
            if (firstError) {
                toast.error(firstError.message);
            }
            return;
        }

        if (!config.name) {
            toast.error(nameRequiredMessage);
            return;
        }
        onComplete(config);
    }, [config, onComplete, nameRequiredMessage, isSubmitting, validateCurrentStep]);

    return {
        config,
        setConfig,
        currentStep,
        setCurrentStep,
        stepErrors,
        setStepErrors,
        attemptedNext,
        setAttemptedNext,
        updateConfig,
        handleNext,
        handleBack,
        handleStepClick,
        handleComplete,
        canProceed,
    };
}
