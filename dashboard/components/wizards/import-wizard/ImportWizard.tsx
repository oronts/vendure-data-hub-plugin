import * as React from 'react';
import { useLingui } from '@lingui/react';
import { Play } from 'lucide-react';
import { toast } from 'sonner';
import { VENDURE_ENTITY_SCHEMAS } from '../../../../shared';
import type { ParsedData } from '../../../types';
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
import {
    FILE_FORMAT,
    FILE_FORMAT_REGISTRY,
    IMPORT_WIZARD_TRANSLATION_IDS,
    SOURCE_TYPE,
    TRIGGER_TYPE,
    UI_LIMITS,
} from '../../../constants';
import type { FileParseOptions } from '../../../constants/file-format-registry';
import { detectFileFormat } from '../../../constants/file-format-registry';
import { normalizeString, validateImportWizardStep } from '../../../utils';
import { useImportTemplates } from '../../../hooks/use-import-templates';
import type { ImportTemplate } from '../../../hooks/use-import-templates';
import { useAdaptersByType } from '../../../hooks/api/use-adapters';
import { useEntityFieldSchemas } from '../../../hooks/api/use-entity-field-schemas';
import { useTriggerTypeSchemas } from '../../../hooks/api/use-config-options';
import { useWizardNavigation } from '../../../hooks/use-wizard-navigation';

import { uploadDataHubFile } from '../../../utils/file-upload';
import {
    createDefaultImportSource,
    isImportSourceAvailable,
    mergeFileSourceConfig,
} from './source-config';
import {
    getFileParseErrorMessage,
    getFileUploadErrorMessage,
} from './file-error-messages';
import { buildImportTargetSchema } from './target-schema';
import { localizeImportWizardValidation } from './localize-validation';

export function ImportWizard({
    onComplete,
    onCancel,
    canManageFiles,
    initialConfig,
    isSubmitting,
}: ImportWizardProps) {
    const { i18n } = useLingui();
    const {
        templates,
        categories,
        isLoading: templatesLoading,
        isError: templatesFailed,
        error: templatesError,
        refetch: refetchTemplates,
    } = useImportTemplates();
    const { data: extractors } = useAdaptersByType('EXTRACTOR');
    const { getFields: getBackendFields } = useEntityFieldSchemas();
    const { schemas: triggerSchemas } = useTriggerTypeSchemas();
    const availableTemplates = React.useMemo(
        () => templates.filter(template =>
            isImportSourceAvailable(template.definition?.sourceType, canManageFiles)),
        [canManageFiles, templates],
    );
    const availableCategories = React.useMemo(
        () => categories
            .map(category => ({
                ...category,
                count: availableTemplates.filter(
                    template => template.category === category.category,
                ).length,
            }))
            .filter(category => category.count > 0),
        [availableTemplates, categories],
    );

    const [selectedTemplate, setSelectedTemplate] = React.useState<ImportTemplate | null>(null);
    const [templateApplied, setTemplateApplied] = React.useState(false);
    const [startedFromScratch, setStartedFromScratch] = React.useState(false);

    const steps = templateApplied || startedFromScratch
        ? WIZARD_STEPS_FROM_TEMPLATE
        : WIZARD_STEPS;
    const activeSteps = steps.map(step => ({
        ...step,
        label: i18n._(step.label),
    }));

    const [uploadedFile, setUploadedFile] = React.useState<File | null>(null);
    const [parsedData, setParsedData] = React.useState<ParsedData | null>(null);
    const [isParsing, setIsParsing] = React.useState(false);
    const [isUploading, setIsUploading] = React.useState(false);
    const initialWizardConfig = React.useMemo<Partial<ImportConfiguration>>(() => {
        const defaultSource = createDefaultImportSource(canManageFiles);
        if (!initialConfig) {
            return {
                name: '',
                source: defaultSource,
                targetEntity: '',
                mappings: [],
                strategies: { ...DEFAULT_IMPORT_STRATEGIES },
                trigger: { type: TRIGGER_TYPE.MANUAL },
                transformations: [],
            };
        }

        return {
            ...initialConfig,
            source: initialConfig.source
                && isImportSourceAvailable(initialConfig.source.type, canManageFiles)
                ? initialConfig.source
                : defaultSource,
        };
    }, [canManageFiles, initialConfig]);

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
                errors: [{ field: 'adapters', message: i18n._(IMPORT_WIZARD_TRANSLATION_IDS.VALIDATION_LOADING_ADAPTERS), type: 'required' as const }],
                errorsByField: { adapters: i18n._(IMPORT_WIZARD_TRANSLATION_IDS.VALIDATION_LOADING_ADAPTERS) },
            };
        }
        if (stepId === IMPORT_STEP_ID.SOURCE
            && cfg.source?.type === SOURCE_TYPE.FILE
            && uploadedFile
            && !cfg.source.fileConfig?.fileId) {
            return {
                isValid: false,
                errors: [{ field: 'file', message: i18n._(IMPORT_WIZARD_TRANSLATION_IDS.VALIDATION_UPLOADING_FILE), type: 'required' as const }],
                errorsByField: { file: i18n._(IMPORT_WIZARD_TRANSLATION_IDS.VALIDATION_UPLOADING_FILE) },
            };
        }
        const result = validateImportWizardStep(
            stepId,
            cfg,
            uploadedFile,
            extractors,
            triggerSchemas,
        );
        return localizeImportWizardValidation(
            result,
            { stepId, config: cfg, adapterSchemas: extractors, triggerSchemas },
            (id, values) => i18n._(id, values),
        );
    }, [i18n, uploadedFile, extractors, triggerSchemas]);

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
        initialConfig: initialWizardConfig,
        validateStep,
        onComplete: onComplete as (config: Partial<ImportConfiguration>) => void,
        nameRequiredMessage: i18n._(IMPORT_WIZARD_TRANSLATION_IDS.VALIDATION_NAME_REQUIRED),
        isSubmitting,
    });

    const handleSelectTemplate = React.useCallback((template: ImportTemplate | null) => {
        setSelectedTemplate(template);
    }, []);

    const handleUseTemplate = React.useCallback((template: ImportTemplate) => {
        setSelectedTemplate(template);
        setTemplateApplied(true);
        const def = template.definition;
        setConfig(prev => ({
            ...prev,
            name: template.name,
            ...(def?.sourceType ? { source: { type: def.sourceType, fileConfig: { format: def.fileFormat ?? 'CSV', hasHeaders: true } } } : {}),
            ...(def?.targetEntity ? { targetEntity: def.targetEntity } : {}),
            ...(def?.existingRecords ? {
                strategies: {
                    ...DEFAULT_IMPORT_STRATEGIES,
                    ...prev.strategies,
                    existingRecords: def.existingRecords,
                    lookupFields: def.lookupFields ?? [],
                },
            } : {}),
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
        toast.success(i18n._(IMPORT_WIZARD_TRANSLATION_IDS.TOAST_TEMPLATE_SELECTED));
    }, [i18n, setConfig, setCurrentStep]);

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

            let newParsedData: ParsedData | null = null;

            if (entry?.parse) {
                const options: FileParseOptions = {
                    delimiter: delimiterRef.current,
                    hasHeaders: hasHeadersRef.current,
                    maxRows: UI_LIMITS.MAX_PREVIEW_ROWS,
                };
                newParsedData = await entry.parse(file, options);
            }
            return newParsedData;
        } finally {
            setIsParsing(false);
        }
    }, []);

    React.useEffect(() => {
        if (!uploadedFile) return;

        let cancelled = false;
        const prepareFile = async () => {
            const detectedFormat = detectFileFormat(uploadedFile.name) ?? undefined;
            if (detectedFormat && detectedFormat !== fileFormatRef.current) {
                fileFormatRef.current = detectedFormat;
                setConfig(prev => ({
                    ...prev,
                    source: mergeFileSourceConfig(prev.source, { format: detectedFormat }),
                }));
            }

            let parsedData: ParsedData | null;
            try {
                parsedData = await parseFile(uploadedFile);
            } catch (error) {
                if (!cancelled) {
                    toast.error(i18n._(IMPORT_WIZARD_TRANSLATION_IDS.TOAST_PARSE_FAILED), {
                        description: getFileParseErrorMessage(
                            error,
                            (id, values) => i18n._(id, values),
                        ),
                    });
                    setUploadedFile(null);
                    setParsedData(null);
                }
                return;
            }

            if (cancelled) return;
            setParsedData(parsedData);
            if (parsedData) {
                toast.success(i18n._(IMPORT_WIZARD_TRANSLATION_IDS.TOAST_PARSED_RECORDS, {
                    count: parsedData.rows.length,
                }));
            }

            setIsUploading(true);
            try {
                const storedFile = await uploadDataHubFile(uploadedFile, {
                    persistent: true,
                });
                if (cancelled) return;
                setConfig(prev => ({
                    ...prev,
                    source: mergeFileSourceConfig(prev.source, { fileId: storedFile.id }),
                }));
            } catch (error) {
                if (!cancelled) {
                    toast.error(
                        i18n._(IMPORT_WIZARD_TRANSLATION_IDS.TOAST_UPLOAD_FAILED),
                        {
                            description: getFileUploadErrorMessage(
                                error,
                                (id, values) => i18n._(id, values),
                            ),
                        },
                    );
                    setUploadedFile(null);
                    setParsedData(null);
                }
            } finally {
                if (!cancelled) setIsUploading(false);
            }
        };

        void prepareFile();
        return () => {
            cancelled = true;
        };
    }, [i18n, uploadedFile, parseFile, setConfig]);

    const handleUploadedFileChange = React.useCallback((file: File | null) => {
        setUploadedFile(file);
        setConfig(prev => ({
            ...prev,
            source: mergeFileSourceConfig(prev.source, { fileId: undefined }),
        }));
        if (!file) setParsedData(null);
    }, [setConfig]);

    React.useEffect(() => {
        if (config.targetEntity && parsedData) {
            // Use backend fields as primary source, fall back to static schemas during loading
            const backendFields = getBackendFields(config.targetEntity);
            const staticSchema = VENDURE_ENTITY_SCHEMAS[config.targetEntity];
            const targetSchema = buildImportTargetSchema(
                config.targetEntity,
                backendFields,
                staticSchema,
            );

            const fieldEntries = targetSchema
                ? Object.entries(targetSchema.fields).map(([name, definition]) => ({
                    name,
                    required: definition.required ?? false,
                }))
                : [];

            if (fieldEntries.length === 0) return;

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

            setConfig(prev => {
                const existingMappings = prev.mappings ?? [];
                if (existingMappings.length > 0) {
                    return {
                        ...prev,
                        mappings: existingMappings.map(mapping => ({
                            ...mapping,
                            preview: mapping.sourceField && parsedData.headers.includes(mapping.sourceField)
                                ? parsedData.rows.slice(0, 3).map(r => r[mapping.sourceField])
                                : mapping.preview,
                        })),
                        targetSchema,
                    };
                }

                return {
                    ...prev,
                    mappings: autoMappings,
                    targetSchema,
                    strategies: {
                        ...DEFAULT_IMPORT_STRATEGIES,
                        ...(prev.strategies ?? {}),
                        lookupFields: targetSchema?.primaryKey
                            ? (Array.isArray(targetSchema.primaryKey) ? targetSchema.primaryKey : [targetSchema.primaryKey])
                            : [],
                    },
                };
            });
            setStepErrors({});
            setAttemptedNext(false);
        }
    }, [config.targetEntity, parsedData, getBackendFields, setConfig, setStepErrors, setAttemptedNext]);

    const currentStepId = activeSteps[currentStep]?.id;

    return (
        <div className="flex h-full min-w-0 max-w-full flex-col overflow-hidden" data-testid="datahub-importwizard-wizard">
            <WizardProgressBar
                steps={activeSteps}
                currentStep={currentStep}
                onStepClick={handleStepClick}
            />

            <div className="min-w-0 flex-1 overflow-auto p-4 sm:p-6" data-testid="datahub-importwizard-steps">
                <ValidationErrorDisplay errors={stepErrors} show={attemptedNext} />

                {currentStepId === IMPORT_STEP_ID.TEMPLATE && (
                    <TemplateStep
                        templates={availableTemplates}
                        categories={availableCategories}
                        isLoading={templatesLoading}
                        isError={templatesFailed}
                        error={templatesError}
                        onRetry={() => void refetchTemplates()}
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
                        setUploadedFile={handleUploadedFileChange}
                        isParsing={isParsing || isUploading}
                        errors={attemptedNext ? stepErrors : {}}
                        canManageFiles={canManageFiles}
                    />
                )}

                {currentStepId === IMPORT_STEP_ID.PREVIEW && (
                    <PreviewStep parsedData={parsedData} isParsing={isParsing} />
                )}

                {currentStepId === IMPORT_STEP_ID.TARGET && (
                    <TargetStep config={config} updateConfig={updateConfig} />
                )}

                {currentStepId === IMPORT_STEP_ID.MAPPING && (
                    <MappingStep
                        config={config}
                        updateConfig={updateConfig}
                        sourceFields={parsedData?.headers ?? []}
                        sampleData={parsedData?.rows ?? []}
                    />
                )}

                {currentStepId === IMPORT_STEP_ID.TRANSFORM && (
                    <TransformStep config={config} updateConfig={updateConfig} />
                )}

                {currentStepId === IMPORT_STEP_ID.STRATEGY && (
                    <StrategyStep config={config} updateConfig={updateConfig} />
                )}

                {currentStepId === IMPORT_STEP_ID.TRIGGER && (
                    <TriggerStep config={config} updateConfig={updateConfig} />
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
                completeLabel={i18n._(IMPORT_WIZARD_TRANSLATION_IDS.CREATE_IMPORT)}
                completeIcon={Play}
                isSubmitting={isSubmitting}
            />
        </div>
    );
}
