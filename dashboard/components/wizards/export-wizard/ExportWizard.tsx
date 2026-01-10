/**
 * Export Wizard - Main Component
 * Multi-step wizard for configuring data exports
 */

import * as React from 'react';
import { Button } from '@vendure/dashboard';
import {
    Download,
    ChevronRight,
    ChevronLeft,
    X,
    Check,
    AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { VENDURE_ENTITY_SCHEMAS } from '../../../../vendure-schemas/vendure-entity-schemas';
import { WIZARD_STEPS } from './constants';
import type { ExportWizardProps, ExportConfiguration, ExportField } from './types';
import { SourceStep } from './SourceStep';
import { FieldsStep } from './FieldsStep';
import { FormatStep } from './FormatStep';
import { DestinationStep } from './DestinationStep';
import { TriggerStep } from './TriggerStep';
import { ReviewStep } from './ReviewStep';
import { validateExportWizardStep } from '../../../utils/form-validation';

export function ExportWizard({ onComplete, onCancel, initialConfig }: ExportWizardProps) {
    const [currentStep, setCurrentStep] = React.useState(0);
    const [config, setConfig] = React.useState<Partial<ExportConfiguration>>(initialConfig ?? {
        name: '',
        sourceEntity: '',
        sourceQuery: { type: 'all', limit: 10000, orderBy: 'id', orderDirection: 'ASC' },
        filters: [],
        fields: [],
        format: { type: 'csv', options: { delimiter: ',', includeHeaders: true } },
        destination: { type: 'file', fileConfig: { directory: '/exports', filename: 'export.csv' } },
        trigger: { type: 'manual' },
        options: {
            batchSize: 1000,
            includeMetadata: false,
            compression: 'none',
            notifyOnComplete: true,
            retryOnFailure: true,
            maxRetries: 3,
        },
    });

    // Validation state
    const [stepErrors, setStepErrors] = React.useState<Record<string, string>>({});
    const [attemptedNext, setAttemptedNext] = React.useState(false);

    const updateConfig = (updates: Partial<ExportConfiguration>) => {
        setConfig(prev => ({ ...prev, ...updates }));
        // Clear errors when config changes
        setStepErrors({});
        setAttemptedNext(false);
    };

    // Validation for current step
    const validateCurrentStep = React.useCallback(() => {
        const stepId = WIZARD_STEPS[currentStep].id;
        const validation = validateExportWizardStep(stepId, config);
        return validation;
    }, [currentStep, config]);

    const { canProceed, validationErrors } = React.useMemo(() => {
        const validation = validateCurrentStep();
        return {
            canProceed: validation.isValid,
            validationErrors: validation.errorsByField,
        };
    }, [validateCurrentStep]);

    // Auto-populate fields when source entity changes
    React.useEffect(() => {
        if (config.sourceEntity) {
            const schema = VENDURE_ENTITY_SCHEMAS[config.sourceEntity];
            if (schema) {
                const fields: ExportField[] = Object.entries(schema.fields).map(([name, field]) => ({
                    sourceField: name,
                    outputName: name,
                    include: true,
                }));
                updateConfig({ fields });
            }
        }
    }, [config.sourceEntity]);

    const handleNext = () => {
        setAttemptedNext(true);
        const validation = validateCurrentStep();

        if (!validation.isValid) {
            setStepErrors(validation.errorsByField);
            // Show first error as toast
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
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setAttemptedNext(false);
            setStepErrors({});
            setCurrentStep(prev => prev - 1);
        }
    };

    const handleComplete = () => {
        if (!config.name) {
            toast.error('Please provide a name for the export configuration');
            return;
        }
        onComplete(config as ExportConfiguration);
    };

    return (
        <div className="flex flex-col h-full">
            {/* Progress Bar */}
            <WizardProgressBar
                steps={WIZARD_STEPS}
                currentStep={currentStep}
                onStepClick={setCurrentStep}
            />

            {/* Step Content */}
            <div className="flex-1 overflow-auto p-6">
                {/* Validation Error Summary */}
                {attemptedNext && Object.keys(stepErrors).length > 0 && (
                    <div className="mb-4 p-3 rounded-lg border border-destructive/50 bg-destructive/10">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
                            <div>
                                <div className="text-sm font-medium text-destructive mb-1">Please fix the following errors:</div>
                                <ul className="text-sm text-destructive/90 list-disc pl-4">
                                    {Object.entries(stepErrors).map(([field, error]) => (
                                        <li key={field}>{error}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {WIZARD_STEPS[currentStep].id === 'source' && (
                    <SourceStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}

                {WIZARD_STEPS[currentStep].id === 'fields' && (
                    <FieldsStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}

                {WIZARD_STEPS[currentStep].id === 'format' && (
                    <FormatStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}

                {WIZARD_STEPS[currentStep].id === 'destination' && (
                    <DestinationStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}

                {WIZARD_STEPS[currentStep].id === 'trigger' && (
                    <TriggerStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}

                {WIZARD_STEPS[currentStep].id === 'review' && (
                    <ReviewStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}
            </div>

            {/* Footer */}
            <WizardFooter
                currentStep={currentStep}
                totalSteps={WIZARD_STEPS.length}
                canProceed={canProceed}
                onBack={handleBack}
                onNext={handleNext}
                onComplete={handleComplete}
                onCancel={onCancel}
            />
        </div>
    );
}

interface WizardProgressBarProps {
    steps: typeof WIZARD_STEPS;
    currentStep: number;
    onStepClick: (step: number) => void;
}

function WizardProgressBar({ steps, currentStep, onStepClick }: WizardProgressBarProps) {
    return (
        <div className="flex items-center gap-2 p-4 border-b bg-muted/30">
            {steps.map((step, index) => {
                const Icon = step.icon;
                const isActive = index === currentStep;
                const isCompleted = index < currentStep;

                return (
                    <React.Fragment key={step.id}>
                        <button
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                                isActive
                                    ? 'bg-primary text-primary-foreground'
                                    : isCompleted
                                        ? 'bg-green-100 text-green-700'
                                        : 'text-muted-foreground hover:bg-muted'
                            }`}
                            onClick={() => index < currentStep && onStepClick(index)}
                            disabled={index > currentStep}
                        >
                            {isCompleted ? (
                                <Check className="w-4 h-4" />
                            ) : (
                                <Icon className="w-4 h-4" />
                            )}
                            <span className="text-sm font-medium hidden lg:inline">{step.label}</span>
                        </button>
                        {index < steps.length - 1 && (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
}

interface WizardFooterProps {
    currentStep: number;
    totalSteps: number;
    canProceed: boolean;
    onBack: () => void;
    onNext: () => void;
    onComplete: () => void;
    onCancel: () => void;
}

function WizardFooter({
    currentStep,
    totalSteps,
    canProceed,
    onBack,
    onNext,
    onComplete,
    onCancel,
}: WizardFooterProps) {
    return (
        <div className="flex items-center justify-between p-4 border-t bg-muted/30">
            <Button variant="outline" onClick={onCancel}>
                <X className="w-4 h-4 mr-2" />
                Cancel
            </Button>

            <div className="flex items-center gap-2">
                {currentStep > 0 && (
                    <Button variant="outline" onClick={onBack}>
                        <ChevronLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                )}

                {currentStep < totalSteps - 1 ? (
                    <Button onClick={onNext} disabled={!canProceed}>
                        Next
                        <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                ) : (
                    <Button onClick={onComplete} disabled={!canProceed}>
                        <Download className="w-4 h-4 mr-2" />
                        Create Export
                    </Button>
                )}
            </div>
        </div>
    );
}

export default ExportWizard;
