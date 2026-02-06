import * as React from 'react';
import { Play } from 'lucide-react';
import { toast } from 'sonner';
import { VENDURE_ENTITY_SCHEMAS } from '../../../../vendure-schemas/vendure-entity-schemas';
import type { EnhancedFieldDefinition } from '../../../types';
import type { ImportWizardProps, ImportConfiguration, FieldMapping } from './types';
import { WIZARD_STEPS, IMPORT_STEP_ID } from './constants';
import { SourceStep } from './SourceStep';
import { PreviewStep } from './PreviewStep';
import { TargetStep } from './TargetStep';
import { MappingStep } from './MappingStep';
import { TransformStep } from './TransformStep';
import { StrategyStep } from './StrategyStep';
import { TriggerStep } from './TriggerStep';
import { ReviewStep } from './ReviewStep';
import { validateImportWizardStep } from '../../../utils/form-validation';
import { WizardProgressBar, WizardFooter, ValidationErrorDisplay } from '../../shared';
import { BATCH_SIZES, UI_LIMITS, UI_DEFAULTS, TRIGGER_TYPES, FILE_FORMAT, SOURCE_TYPE, CLEANUP_STRATEGY, TOAST_WIZARD, formatParseError, formatParsedRecords } from '../../../constants';
import { normalizeString } from '../../../utils';

export function ImportWizard({ onComplete, onCancel, initialConfig }: ImportWizardProps) {
    const [currentStep, setCurrentStep] = React.useState(0);
    const [config, setConfig] = React.useState<Partial<ImportConfiguration>>(initialConfig ?? {
        name: '',
        source: { type: SOURCE_TYPE.FILE, fileConfig: { format: FILE_FORMAT.CSV, hasHeaders: true } },
        targetEntity: '',
        mappings: [],
        strategies: {
            existingRecords: 'update',
            lookupFields: [],
            newRecords: 'create',
            publishAfterImport: false,
            cleanupStrategy: CLEANUP_STRATEGY.NONE,
            batchSize: BATCH_SIZES.IMPORT_DEFAULT,
            parallelBatches: 1,
            errorThreshold: UI_DEFAULTS.DEFAULT_ERROR_THRESHOLD_PERCENT,
            continueOnError: true,
        },
        trigger: { type: TRIGGER_TYPES.MANUAL },
        transformations: [],
    });

    const [uploadedFile, setUploadedFile] = React.useState<File | null>(null);
    const [parsedData, setParsedData] = React.useState<{ headers: string[]; rows: Record<string, unknown>[] } | null>(null);
    const [isParsing, setIsParsing] = React.useState(false);
    const [stepErrors, setStepErrors] = React.useState<Record<string, string>>({});
    const [attemptedNext, setAttemptedNext] = React.useState(false);

    const updateConfig = React.useCallback((updates: Partial<ImportConfiguration>) => {
        setConfig(prev => ({ ...prev, ...updates }));
        setStepErrors({});
        setAttemptedNext(false);
    }, []);

    // Memoize validation based on specific config properties to prevent unnecessary recalculations
    const configSignature = React.useMemo(
        () => JSON.stringify([
            config.source?.type,
            config.source?.fileConfig?.format,
            config.targetEntity,
            config.mappings?.length,
            config.strategies?.lookupFields?.length,
            config.name,
        ]),
        [config.source?.type, config.source?.fileConfig?.format, config.targetEntity, config.mappings?.length, config.strategies?.lookupFields?.length, config.name],
    );

    const validateCurrentStep = React.useCallback(() => {
        const stepId = WIZARD_STEPS[currentStep].id;
        const validation = validateImportWizardStep(stepId, config, uploadedFile);
        return validation;
    }, [currentStep, configSignature, uploadedFile]);

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
            toast.error(TOAST_WIZARD.IMPORT_NAME_REQUIRED);
            return;
        }
        onComplete(config as ImportConfiguration);
    }, [config, onComplete]);

    // Store file config in refs to avoid unnecessary parseFile recreation
    const fileFormatRef = React.useRef(config.source?.fileConfig?.format ?? FILE_FORMAT.CSV);
    const delimiterRef = React.useRef(config.source?.fileConfig?.delimiter ?? ',');
    const hasHeadersRef = React.useRef(config.source?.fileConfig?.hasHeaders ?? true);

    // Update refs when config changes
    React.useEffect(() => {
        fileFormatRef.current = config.source?.fileConfig?.format ?? FILE_FORMAT.CSV;
        delimiterRef.current = config.source?.fileConfig?.delimiter ?? ',';
        hasHeadersRef.current = config.source?.fileConfig?.hasHeaders ?? true;
    }, [config.source?.fileConfig?.format, config.source?.fileConfig?.delimiter, config.source?.fileConfig?.hasHeaders]);

    const parseFile = React.useCallback(async (file: File) => {
        setIsParsing(true);
        try {
            const text = await file.text();
            const format = fileFormatRef.current;

            let newParsedData: { headers: string[]; rows: Record<string, unknown>[] } | null = null;

            if (format === FILE_FORMAT.CSV) {
                const lines = text.split('\n').filter(line => line.trim());
                const delimiter = delimiterRef.current;
                const hasHeaders = hasHeadersRef.current;

                const headers = hasHeaders
                    ? lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''))
                    : lines[0].split(delimiter).map((_, i) => `column_${i + 1}`);

                const dataLines = hasHeaders ? lines.slice(1) : lines;
                const rows = dataLines.slice(0, UI_LIMITS.MAX_PREVIEW_ROWS).map(line => {
                    const values = line.split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
                    const row: Record<string, unknown> = {};
                    headers.forEach((header, i) => {
                        row[header] = values[i] ?? '';
                    });
                    return row;
                });

                newParsedData = { headers, rows };
            } else if (format === FILE_FORMAT.JSON) {
                const json = JSON.parse(text);
                const items = Array.isArray(json) ? json : json.data ?? [json];
                const sampleItems = items.slice(0, UI_LIMITS.MAX_PREVIEW_ROWS) as Record<string, unknown>[];
                const headers = [...new Set(sampleItems.flatMap(item => Object.keys(item)))];
                newParsedData = { headers, rows: sampleItems };
            }

            setParsedData(newParsedData);
            toast.success(formatParsedRecords(newParsedData?.rows.length ?? 0));
        } catch (error) {
            toast.error(formatParseError(error));
        } finally {
            setIsParsing(false);
        }
    }, []); // No dependencies - uses refs for config values

    React.useEffect(() => {
        if (uploadedFile) {
            parseFile(uploadedFile);
        }
    }, [uploadedFile, parseFile]);

    React.useEffect(() => {
        if (config.targetEntity && parsedData) {
            const schema = VENDURE_ENTITY_SCHEMAS[config.targetEntity];
            if (schema) {
                const autoMappings: FieldMapping[] = [];

                Object.entries(schema.fields).forEach(([fieldName, fieldDef]) => {
                    const matchingSource = parsedData.headers.find(h => {
                        const normalized = normalizeString(h);
                        const fieldNormalized = normalizeString(fieldName);
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

                // Use functional setState to avoid stale closure with config.strategies
                setConfig(prev => ({
                    ...prev,
                    mappings: autoMappings,
                    targetSchema: schema,
                    strategies: {
                        ...prev.strategies!,
                        lookupFields: schema.primaryKey
                            ? (Array.isArray(schema.primaryKey) ? schema.primaryKey : [schema.primaryKey])
                            : [],
                    },
                }));
                setStepErrors({});
                setAttemptedNext(false);
            }
        }
    }, [config.targetEntity, parsedData]);

    return (
        <div className="flex flex-col h-full" data-testid="datahub-importwizard-wizard">
            <WizardProgressBar
                steps={WIZARD_STEPS}
                currentStep={currentStep}
                onStepClick={setCurrentStep}
            />

            <div className="flex-1 overflow-auto p-6" data-testid="datahub-importwizard-steps">
                <ValidationErrorDisplay errors={stepErrors} show={attemptedNext} />

                {WIZARD_STEPS[currentStep].id === IMPORT_STEP_ID.SOURCE && (
                    <SourceStep
                        config={config}
                        updateConfig={updateConfig}
                        uploadedFile={uploadedFile}
                        setUploadedFile={setUploadedFile}
                        isParsing={isParsing}
                        errors={attemptedNext ? stepErrors : {}}
                    />
                )}

                {WIZARD_STEPS[currentStep].id === IMPORT_STEP_ID.PREVIEW && (
                    <PreviewStep parsedData={parsedData} isParsing={isParsing} />
                )}

                {WIZARD_STEPS[currentStep].id === IMPORT_STEP_ID.TARGET && (
                    <TargetStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}

                {WIZARD_STEPS[currentStep].id === IMPORT_STEP_ID.MAPPING && (
                    <MappingStep
                        config={config}
                        updateConfig={updateConfig}
                        sourceFields={parsedData?.headers ?? []}
                        sampleData={parsedData?.rows ?? []}
                        errors={attemptedNext ? stepErrors : {}}
                    />
                )}

                {WIZARD_STEPS[currentStep].id === IMPORT_STEP_ID.TRANSFORM && (
                    <TransformStep config={config} updateConfig={updateConfig} />
                )}

                {WIZARD_STEPS[currentStep].id === IMPORT_STEP_ID.STRATEGY && (
                    <StrategyStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}

                {WIZARD_STEPS[currentStep].id === IMPORT_STEP_ID.TRIGGER && (
                    <TriggerStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}

                {WIZARD_STEPS[currentStep].id === IMPORT_STEP_ID.REVIEW && (
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
                completeLabel="Create Import"
                completeIcon={Play}
            />
        </div>
    );
}
