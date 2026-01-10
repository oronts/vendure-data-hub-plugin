/**
 * Import Wizard - Main Component
 * Multi-step wizard for configuring data imports
 */

import * as React from 'react';
import { Button } from '@vendure/dashboard';
import {
    Database,
    Eye,
    Table,
    Columns,
    Zap,
    Settings,
    Clock,
    Check,
    ChevronRight,
    ChevronLeft,
    X,
    Play,
    AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { VENDURE_ENTITY_SCHEMAS } from '../../../../vendure-schemas/vendure-entity-schemas';
import type { EnhancedFieldDefinition } from '../../../../types/index';
import type { ImportWizardProps, ImportConfiguration, FieldMapping, WizardStep } from './types';
import { SourceStep } from './SourceStep';
import { PreviewStep } from './PreviewStep';
import { TargetStep } from './TargetStep';
import { MappingStep } from './MappingStep';
import { TransformStep } from './TransformStep';
import { StrategyStep } from './StrategyStep';
import { TriggerStep } from './TriggerStep';
import { ReviewStep } from './ReviewStep';
import { validateImportWizardStep, validateUrl, validateCron } from '../../../utils/form-validation';

// WIZARD STEPS

const WIZARD_STEPS: WizardStep[] = [
    { id: 'source', label: 'Data Source', icon: Database },
    { id: 'preview', label: 'Preview Data', icon: Eye },
    { id: 'target', label: 'Target Entity', icon: Table },
    { id: 'mapping', label: 'Field Mapping', icon: Columns },
    { id: 'transform', label: 'Transformations', icon: Zap },
    { id: 'strategy', label: 'Import Strategy', icon: Settings },
    { id: 'trigger', label: 'Trigger & Schedule', icon: Clock },
    { id: 'review', label: 'Review & Create', icon: Check },
];

// MAIN COMPONENT

export function ImportWizard({ onComplete, onCancel, initialConfig }: ImportWizardProps) {
    const [currentStep, setCurrentStep] = React.useState(0);
    const [config, setConfig] = React.useState<Partial<ImportConfiguration>>(initialConfig ?? {
        name: '',
        source: { type: 'file', fileConfig: { format: 'csv', hasHeaders: true } },
        targetEntity: '',
        mappings: [],
        strategies: {
            existingRecords: 'update',
            lookupFields: [],
            newRecords: 'create',
            publishAfterImport: false,
            cleanupStrategy: 'none',
            batchSize: 100,
            parallelBatches: 1,
            errorThreshold: 10,
            continueOnError: true,
        },
        trigger: { type: 'manual' },
        transformations: [],
    });

    // File upload state
    const [uploadedFile, setUploadedFile] = React.useState<File | null>(null);
    const [parsedData, setParsedData] = React.useState<{ headers: string[]; rows: Record<string, unknown>[] } | null>(null);
    const [isParsing, setIsParsing] = React.useState(false);

    // Validation state
    const [stepErrors, setStepErrors] = React.useState<Record<string, string>>({});
    const [attemptedNext, setAttemptedNext] = React.useState(false);

    const updateConfig = (updates: Partial<ImportConfiguration>) => {
        setConfig(prev => ({ ...prev, ...updates }));
        // Clear errors when config changes
        setStepErrors({});
        setAttemptedNext(false);
    };

    // Validation for current step
    const validateCurrentStep = React.useCallback(() => {
        const stepId = WIZARD_STEPS[currentStep].id;
        const validation = validateImportWizardStep(stepId, config, uploadedFile);
        return validation;
    }, [currentStep, config, uploadedFile]);

    const { canProceed, validationErrors } = React.useMemo(() => {
        const validation = validateCurrentStep();
        return {
            canProceed: validation.isValid,
            validationErrors: validation.errorsByField,
        };
    }, [validateCurrentStep]);

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
            toast.error('Please provide a name for the import configuration');
            return;
        }
        onComplete(config as ImportConfiguration);
    };

    // Parse uploaded file
    const parseFile = async (file: File) => {
        setIsParsing(true);
        try {
            const text = await file.text();
            const format = config.source?.fileConfig?.format ?? 'csv';

            if (format === 'csv') {
                const lines = text.split('\n').filter(line => line.trim());
                const delimiter = config.source?.fileConfig?.delimiter ?? ',';
                const hasHeaders = config.source?.fileConfig?.hasHeaders ?? true;

                const headers = hasHeaders
                    ? lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''))
                    : lines[0].split(delimiter).map((_, i) => `column_${i + 1}`);

                const dataLines = hasHeaders ? lines.slice(1) : lines;
                const rows = dataLines.slice(0, 100).map(line => {
                    const values = line.split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
                    const row: Record<string, unknown> = {};
                    headers.forEach((header, i) => {
                        row[header] = values[i] ?? '';
                    });
                    return row;
                });

                setParsedData({ headers, rows });
            } else if (format === 'json') {
                const json = JSON.parse(text);
                // Standardize on 'data' as the array wrapper field for JSON imports
                const items = Array.isArray(json) ? json : json.data ?? [json];
                const sampleItems = items.slice(0, 100);
                const headers = [...new Set(sampleItems.flatMap((item: any) => Object.keys(item)))];
                setParsedData({ headers, rows: sampleItems });
            }

            toast.success(`Parsed ${parsedData?.rows.length ?? 0} records`);
        } catch (error) {
            toast.error('Failed to parse file: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
            setIsParsing(false);
        }
    };

    React.useEffect(() => {
        if (uploadedFile) {
            parseFile(uploadedFile);
        }
    }, [uploadedFile, config.source?.fileConfig?.format, config.source?.fileConfig?.delimiter]);

    // Auto-generate mappings when target entity is selected
    React.useEffect(() => {
        if (config.targetEntity && parsedData) {
            const schema = VENDURE_ENTITY_SCHEMAS[config.targetEntity];
            if (schema) {
                const autoMappings: FieldMapping[] = [];

                Object.entries(schema.fields).forEach(([fieldName, fieldDef]) => {
                    // Try to find matching source field
                    const matchingSource = parsedData.headers.find(h => {
                        const normalized = h.toLowerCase().replace(/[_\-\s]/g, '');
                        const fieldNormalized = fieldName.toLowerCase().replace(/[_\-\s]/g, '');
                        return normalized === fieldNormalized ||
                            normalized.includes(fieldNormalized) ||
                            fieldNormalized.includes(normalized);
                    });

                    if (matchingSource || (fieldDef as EnhancedFieldDefinition).required) {
                        autoMappings.push({
                            sourceField: matchingSource ?? '',
                            targetField: fieldName,
                            required: (fieldDef as EnhancedFieldDefinition).required ?? false,
                            preview: matchingSource
                                ? parsedData.rows.slice(0, 3).map(r => r[matchingSource])
                                : [],
                        });
                    }
                });

                updateConfig({
                    mappings: autoMappings,
                    targetSchema: schema,
                    strategies: {
                        ...config.strategies!,
                        lookupFields: schema.primaryKey
                            ? (Array.isArray(schema.primaryKey) ? schema.primaryKey : [schema.primaryKey])
                            : [],
                    },
                });
            }
        }
    }, [config.targetEntity, parsedData]);

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
                    <SourceStep
                        config={config}
                        updateConfig={updateConfig}
                        uploadedFile={uploadedFile}
                        setUploadedFile={setUploadedFile}
                        isParsing={isParsing}
                        errors={attemptedNext ? stepErrors : {}}
                    />
                )}

                {WIZARD_STEPS[currentStep].id === 'preview' && (
                    <PreviewStep parsedData={parsedData} isParsing={isParsing} />
                )}

                {WIZARD_STEPS[currentStep].id === 'target' && (
                    <TargetStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}

                {WIZARD_STEPS[currentStep].id === 'mapping' && (
                    <MappingStep
                        config={config}
                        updateConfig={updateConfig}
                        sourceFields={parsedData?.headers ?? []}
                        sampleData={parsedData?.rows ?? []}
                        errors={attemptedNext ? stepErrors : {}}
                    />
                )}

                {WIZARD_STEPS[currentStep].id === 'transform' && (
                    <TransformStep config={config} updateConfig={updateConfig} />
                )}

                {WIZARD_STEPS[currentStep].id === 'strategy' && (
                    <StrategyStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
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

// PROGRESS BAR COMPONENT

interface WizardProgressBarProps {
    steps: WizardStep[];
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

// FOOTER COMPONENT

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
                        <Play className="w-4 h-4 mr-2" />
                        Create Import
                    </Button>
                )}
            </div>
        </div>
    );
}

export default ImportWizard;
