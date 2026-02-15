import * as React from 'react';
import { toast } from 'sonner';
import type { WizardStep } from '../types/Wizard';

interface ValidationResult {
    isValid: boolean;
    errors: Array<{ field: string; message: string }>;
    errorsByField: Record<string, string>;
}

type ValidateFn<C> = (stepId: string, config: Partial<C>, extra?: unknown) => ValidationResult;

interface UseWizardOptions<C> {
    steps: WizardStep[];
    initialConfig: Partial<C>;
    validate: ValidateFn<C>;
    onComplete: (config: C) => void;
    /** Name field key to check before completing (defaults to 'name') */
    nameField?: keyof C;
    /** Toast message if name is missing */
    nameRequiredMessage?: string;
    /** Extra arg passed to validate (e.g., uploadedFile) */
    validateExtra?: unknown;
    /** Config keys to include in validation signature memoization */
    signatureKeys?: (config: Partial<C>) => unknown[];
}

interface UseWizardReturn<C> {
    currentStep: number;
    setCurrentStep: React.Dispatch<React.SetStateAction<number>>;
    config: Partial<C>;
    setConfig: React.Dispatch<React.SetStateAction<Partial<C>>>;
    stepErrors: Record<string, string>;
    attemptedNext: boolean;
    updateConfig: (updates: Partial<C>) => void;
    handleNext: () => void;
    handleBack: () => void;
    handleComplete: () => void;
    canProceed: boolean;
    validationErrors: Record<string, string>;
    validateCurrentStep: () => ValidationResult;
}

export function useWizard<C>(options: UseWizardOptions<C>): UseWizardReturn<C> {
    const {
        steps,
        initialConfig,
        validate,
        onComplete,
        nameField = 'name' as keyof C,
        nameRequiredMessage = 'Name is required',
        validateExtra,
        signatureKeys,
    } = options;

    const [currentStep, setCurrentStep] = React.useState(0);
    const [config, setConfig] = React.useState<Partial<C>>(initialConfig);
    const [stepErrors, setStepErrors] = React.useState<Record<string, string>>({});
    const [attemptedNext, setAttemptedNext] = React.useState(false);

    const updateConfig = React.useCallback((updates: Partial<C>) => {
        setConfig(prev => ({ ...prev, ...updates }));
        setStepErrors({});
        setAttemptedNext(false);
    }, []);

    const configSignature = React.useMemo(
        () => signatureKeys ? JSON.stringify(signatureKeys(config)) : JSON.stringify(config),
        signatureKeys ? [config] : [config],
    );

    const validateCurrentStep = React.useCallback(() => {
        const stepId = steps[currentStep]?.id ?? '';
        return validate(stepId, config, validateExtra);
    }, [currentStep, configSignature, validateExtra, steps, validate]);

    const { canProceed, validationErrors } = React.useMemo(() => {
        const validation = validateCurrentStep();
        return {
            canProceed: validation.isValid,
            validationErrors: validation.errorsByField,
        };
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
    }, [validateCurrentStep, currentStep, steps.length]);

    const handleBack = React.useCallback(() => {
        if (currentStep > 0) {
            setAttemptedNext(false);
            setStepErrors({});
            setCurrentStep(prev => prev - 1);
        }
    }, [currentStep]);

    const handleComplete = React.useCallback(() => {
        if (!config[nameField]) {
            toast.error(nameRequiredMessage);
            return;
        }
        onComplete(config as C);
    }, [config, onComplete, nameField, nameRequiredMessage]);

    return {
        currentStep,
        setCurrentStep,
        config,
        setConfig,
        stepErrors,
        attemptedNext,
        updateConfig,
        handleNext,
        handleBack,
        handleComplete,
        canProceed,
        validationErrors,
        validateCurrentStep,
    };
}
