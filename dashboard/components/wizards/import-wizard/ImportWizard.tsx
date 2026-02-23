import * as React from 'react';
import { Play } from 'lucide-react';
import { toast } from 'sonner';
import { VENDURE_ENTITY_SCHEMAS } from '../../../../shared';
import type { EnhancedFieldDefinition } from '../../../types';
import type { ImportWizardProps, ImportConfiguration, FieldMapping } from './types';
import { WIZARD_STEPS, WIZARD_STEPS_FROM_TEMPLATE, IMPORT_STEP_ID, DEFAULT_IMPORT_STRATEGIES } from './constants';
import { TemplateStep } from './TemplateStep';
import { SourceStep } from './SourceStep';
import { PreviewStep } from './PreviewStep';
import { TargetStep } from './TargetStep';
import { MappingStep } from './MappingStep';
import { TransformStep } from './TransformStep';
import { StrategyStep } from './StrategyStep';
import { TriggerStep } from './TriggerStep';
import { ReviewStep } from './ReviewStep';
import { WizardProgressBar, WizardFooter, ValidationErrorDisplay } from '../../shared';
import { UI_LIMITS, TRIGGER_TYPE, FILE_FORMAT, SOURCE_TYPE, TOAST_WIZARD, formatParseError, formatParsedRecords, FILE_FORMAT_REGISTRY } from '../../../constants';
import type { FileParseOptions } from '../../../constants/file-format-registry';
import { detectFileFormat } from '../../../constants/file-format-registry';
import { normalizeString, validateImportWizardStep } from '../../../utils';
import { useImportTemplates } from '../../../hooks/use-import-templates';
import type { ImportTemplate } from '../../../hooks/use-import-templates';
import { useAdaptersByType } from '../../../hooks/api/use-adapters';
import { useEntityFieldSchemas } from '../../../hooks/api/use-entity-field-schemas';
import { useTriggerTypeSchemas } from '../../../hooks/api/use-config-options';
import { useWizardNavigation } from '../../../hooks/use-wizard-navigation';

export function ImportWizard({ onComplete, onCancel, initialConfig, isSubmitting }: ImportWizardProps) {
    const { templates, categories } = useImportTemplates();
    const { data: extractors } = useAdaptersByType('EXTRACTOR');
    const { getFields: getBackendFields } = useEntityFieldSchemas();
    const { schemas: triggerSchemas } = useTriggerTypeSchemas();

    const [selectedTemplate, setSelectedTemplate] = React.useState<ImportTemplate | null>(null);
    const [templateApplied, setTemplateApplied] = React.useState(false);
    const [startedFromScratch, setStartedFromScratch] = React.useState(false);

    const activeSteps = React.useMemo(() => {
        if (templateApplied || startedFromScratch) {
            return WIZARD_STEPS_FROM_TEMPLATE;
        }
        return WIZARD_STEPS;
    }, [templateApplied, startedFromScratch]);

    const [uploadedFile, setUploadedFile] = React.useState<File | null>(null);
    const [parsedData, setParsedData] = React.useState<{ headers: string[]; rows: Record<string, unknown>[] } | null>(null);
    const [isParsing, setIsParsing] = React.useState(false);

    const validateStep = React.useCallback((stepId: string, cfg: Partial<ImportConfiguration>) => {
        // Template step is always valid (user can proceed or select)
        if (stepId === IMPORT_STEP_ID.TEMPLATE) {
            return { isValid: true, errors: [], errorsByField: {} };
        }
        // Guard: if source requires adapter schema but extractors haven't loaded yet, block
        if (stepId === IMPORT_STEP_ID.SOURCE
            && cfg.source?.type
            && cfg.source.type !== SOURCE_TYPE.FILE
            && !extractors) {
            return {
                isValid: false,
                errors: [{ field: 'adapters', message: 'Loading adapter configuration, please wait...', type: 'required' as const }],
                errorsByField: { adapters: 'Loading adapter configuration, please wait...' },
            };
        }
        return validateImportWizardStep(stepId, cfg, uploadedFile, extractors, triggerSchemas);
    }, [uploadedFile, extractors, triggerSchemas]);

    const {
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
    } = useWizardNavigation<Partial<ImportConfiguration>>({
        steps: activeSteps,
        initialConfig: initialConfig ?? {
            name: '',
            source: { type: SOURCE_TYPE.FILE, fileConfig: { format: FILE_FORMAT.CSV, hasHeaders: true } },
            targetEntity: '',
            mappings: [],
            strategies: { ...DEFAULT_IMPORT_STRATEGIES },
            trigger: { type: TRIGGER_TYPE.MANUAL },
            transformations: [],
        },
        validateStep,
        onComplete: onComplete as (config: Partial<ImportConfiguration>) => void,
        nameRequiredMessage: TOAST_WIZARD.IMPORT_NAME_REQUIRED,
        isSubmitting,
    });

    // Handle template selection
    const handleSelectTemplate = React.useCallback((template: ImportTemplate | null) => {
        setSelectedTemplate(template);
    }, []);

    const handleUseTemplate = React.useCallback((template: ImportTemplate) => {
        setSelectedTemplate(template);
        setTemplateApplied(true);
        const def = template.definition;
        setConfig(prev => ({
            ...prev,
            name: `${template.name} Import`,
            ...(def?.sourceType ? { source: { type: def.sourceType, fileConfig: { format: def.fileFormat ?? 'CSV', hasHeaders: true } } } : {}),
            ...(def?.targetEntity ? { targetEntity: def.targetEntity } : {}),
            ...(def?.existingRecords ? { strategies: { ...prev.strategies, existingRecords: def.existingRecords, lookupFields: def.lookupFields ?? [] } } : {}),
            ...(def?.fieldMappings?.length ? {
                mappings: def.fieldMappings.map(fm => ({
                    sourceField: fm.sourceField,
                    targetField: fm.targetField,
                    required: false,
                    preview: [],
                })),
            } : {}),
        }));
        // Move to first step after template (source step)
        setCurrentStep(0);
        toast.success(TOAST_WIZARD.TEMPLATE_SELECTED);
    }, [setConfig, setCurrentStep]);

    // Handle starting from scratch
    const handleStartFromScratch = React.useCallback(() => {
        setStartedFromScratch(true);
        setSelectedTemplate(null);
        setCurrentStep(0);
    }, [setCurrentStep]);

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
            const format = fileFormatRef.current;
            const entry = FILE_FORMAT_REGISTRY.get(format);

            let newParsedData: { headers: string[]; rows: Record<string, unknown>[] } | null = null;

            if (entry) {
                const options: FileParseOptions = {
                    delimiter: delimiterRef.current,
                    hasHeaders: hasHeadersRef.current,
                    maxRows: UI_LIMITS.MAX_PREVIEW_ROWS,
                };
                newParsedData = await entry.parse(file, options);
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
            // Auto-detect format from file extension via registry
            const detectedFormat = detectFileFormat(uploadedFile.name) ?? undefined;

            if (detectedFormat && detectedFormat !== fileFormatRef.current) {
                fileFormatRef.current = detectedFormat;
                setConfig(prev => ({
                    ...prev,
                    source: { ...prev.source!, fileConfig: { ...prev.source?.fileConfig!, format: detectedFormat } },
                }));
            }
            parseFile(uploadedFile);
        }
    }, [uploadedFile, parseFile, setConfig]);

    React.useEffect(() => {
        if (config.targetEntity && parsedData) {
            // Use backend fields as primary source, fall back to static schemas during loading
            const backendFields = getBackendFields(config.targetEntity);
            const staticSchema = VENDURE_ENTITY_SCHEMAS[config.targetEntity];

            // Build a unified field list: prefer backend data, fall back to static
            const fieldEntries: { name: string; required: boolean }[] = backendFields.length > 0
                ? backendFields.map(f => ({ name: f.key, required: f.required }))
                : staticSchema
                    ? Object.entries(staticSchema.fields).map(([name, def]) => ({
                        name,
                        required: (def as EnhancedFieldDefinition).required ?? false,
                    }))
                    : [];

            if (fieldEntries.length === 0) return;

            // If mappings already exist (e.g. from template), enhance them with preview data
            if (config.mappings && config.mappings.length > 0) {
                const enhancedMappings = config.mappings.map(mapping => ({
                    ...mapping,
                    preview: mapping.sourceField && parsedData.headers.includes(mapping.sourceField)
                        ? parsedData.rows.slice(0, 3).map(r => r[mapping.sourceField])
                        : mapping.preview,
                }));
                setConfig(prev => ({
                    ...prev,
                    mappings: enhancedMappings,
                    targetSchema: staticSchema,
                }));
                return;
            }

            // Otherwise, auto-map from fields + parsed headers
            const autoMappings: FieldMapping[] = [];

            for (const { name: fieldName, required } of fieldEntries) {
                const matchingSource = parsedData.headers.find(h => {
                    const normalized = normalizeString(h);
                    const fieldNormalized = normalizeString(fieldName);
                    return normalized === fieldNormalized ||
                        normalized.includes(fieldNormalized) ||
                        fieldNormalized.includes(normalized);
                });

                if (matchingSource || required) {
                    autoMappings.push({
                        sourceField: matchingSource ?? '',
                        targetField: fieldName,
                        required,
                        preview: matchingSource
                            ? parsedData.rows.slice(0, 3).map(r => r[matchingSource])
                            : [],
                    });
                }
            }

            // Use functional setState to avoid stale closure with config.strategies
            setConfig(prev => ({
                ...prev,
                mappings: autoMappings,
                targetSchema: staticSchema,
                strategies: {
                    ...(prev.strategies ?? {}),
                    lookupFields: staticSchema?.primaryKey
                        ? (Array.isArray(staticSchema.primaryKey) ? staticSchema.primaryKey : [staticSchema.primaryKey])
                        : [],
                },
            }));
            setStepErrors({});
            setAttemptedNext(false);
        }
    }, [config.targetEntity, parsedData, getBackendFields, setConfig, setStepErrors, setAttemptedNext]);

    const currentStepId = activeSteps[currentStep]?.id;

    return (
        <div className="flex flex-col h-full" data-testid="datahub-importwizard-wizard">
            <WizardProgressBar
                steps={activeSteps}
                currentStep={currentStep}
                onStepClick={handleStepClick}
            />

            <div className="flex-1 overflow-auto p-6" data-testid="datahub-importwizard-steps">
                <ValidationErrorDisplay errors={stepErrors} show={attemptedNext} />

                {currentStepId === IMPORT_STEP_ID.TEMPLATE && (
                    <TemplateStep
                        templates={templates}
                        categories={categories}
                        selectedTemplate={selectedTemplate}
                        onSelectTemplate={handleSelectTemplate}
                        onUseTemplate={handleUseTemplate}
                        onStartFromScratch={handleStartFromScratch}
                    />
                )}

                {currentStepId === IMPORT_STEP_ID.SOURCE && (
                    <SourceStep
                        config={config}
                        updateConfig={updateConfig}
                        uploadedFile={uploadedFile}
                        setUploadedFile={setUploadedFile}
                        isParsing={isParsing}
                        errors={attemptedNext ? stepErrors : {}}
                    />
                )}

                {currentStepId === IMPORT_STEP_ID.PREVIEW && (
                    <PreviewStep parsedData={parsedData} isParsing={isParsing} />
                )}

                {currentStepId === IMPORT_STEP_ID.TARGET && (
                    <TargetStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}

                {currentStepId === IMPORT_STEP_ID.MAPPING && (
                    <MappingStep
                        config={config}
                        updateConfig={updateConfig}
                        sourceFields={parsedData?.headers ?? []}
                        sampleData={parsedData?.rows ?? []}
                        errors={attemptedNext ? stepErrors : {}}
                    />
                )}

                {currentStepId === IMPORT_STEP_ID.TRANSFORM && (
                    <TransformStep config={config} updateConfig={updateConfig} />
                )}

                {currentStepId === IMPORT_STEP_ID.STRATEGY && (
                    <StrategyStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}

                {currentStepId === IMPORT_STEP_ID.TRIGGER && (
                    <TriggerStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}

                {currentStepId === IMPORT_STEP_ID.REVIEW && (
                    <ReviewStep config={config} updateConfig={updateConfig} errors={attemptedNext ? stepErrors : {}} />
                )}
            </div>

            <WizardFooter
                currentStep={currentStep}
                totalSteps={activeSteps.length}
                canProceed={canProceed}
                onBack={handleBack}
                onNext={handleNext}
                onComplete={handleComplete}
                onCancel={onCancel}
                completeLabel="Create Import"
                completeIcon={Play}
                isSubmitting={isSubmitting}
            />
        </div>
    );
}
