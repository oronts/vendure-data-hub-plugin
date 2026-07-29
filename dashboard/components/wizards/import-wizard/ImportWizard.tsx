import * as React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Play } from 'lucide-react';
import { toast } from 'sonner';
import { VENDURE_ENTITY_SCHEMAS } from '../../../../shared';
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
    SOURCE_TYPE,
    TRIGGER_TYPE,
} from '../../../constants';
import { normalizeString, validateImportWizardStep } from '../../../utils';
import { useImportTemplates } from '../../../hooks/use-import-templates';
import type { ImportTemplate } from '../../../hooks/use-import-templates';
import { useAdaptersByType } from '../../../hooks/api/use-adapters';
import { useEntityFieldSchemas } from '../../../hooks/api/use-entity-field-schemas';
import { useTriggerTypeSchemas } from '../../../hooks/api/use-config-options';
import { useWizardNavigation } from '../../../hooks/use-wizard-navigation';

import {
    createDefaultImportSource,
    createImportTemplateSource,
    isImportSourceAvailable,
} from './source-config';
import { buildImportTargetSchema } from './target-schema';
import { localizeImportWizardValidation } from './localize-validation';
import { useImportFilePreparation } from './use-import-file-preparation';

export function ImportWizard({
    onComplete,
    onCancel,
    canManageFiles,
    initialConfig,
    isSubmitting,
}: ImportWizardProps) {
    const { t } = useLingui();
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
    const [uploadedFile, setUploadedFileState] = React.useState<File | null>(null);

    const steps = templateApplied || startedFromScratch
        ? WIZARD_STEPS_FROM_TEMPLATE
        : WIZARD_STEPS;
    const stepLabels: Record<string, string> = {
        template: t`Template`,
        source: t`Source`,
        preview: t`Preview`,
        target: t`Target`,
        mapping: t`Mapping`,
        transform: t`Transform`,
        strategy: t`Strategy`,
        trigger: t`Trigger`,
        review: t`Review`,
    };
    const activeSteps = steps.map(step => ({
        ...step,
        label: stepLabels[step.id] ?? step.label,
    }));

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
                errors: [{ field: 'adapters', message: t`Loader adapters are still loading`, type: 'required' as const }],
                errorsByField: { adapters: t`Loader adapters are still loading` },
            };
        }
        if (stepId === IMPORT_STEP_ID.SOURCE
            && cfg.source?.type === SOURCE_TYPE.FILE
            && uploadedFile
            && !cfg.source.fileConfig?.fileId) {
            return {
                isValid: false,
                errors: [{ field: 'file', message: t`The file is still uploading`, type: 'required' as const }],
                errorsByField: { file: t`The file is still uploading` },
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
            {
                uploadFile: t`Upload a file to continue`,
                unknownSourceAdapter: adapter => t`Unknown source adapter: ${adapter}`,
                sourceConfigurationRequired: t`Source configuration is required`,
                targetEntityRequired: t`Select a target entity`,
                requiredFieldsMapped: fields => t`Map all required fields: ${fields}`,
                mappingRequired: t`Add at least one field mapping`,
                existingRecordsStrategy: t`Select a strategy for existing records`,
                lookupFieldRequired: t`Select at least one lookup field`,
                nameRequired: t`Name is required`,
                invalidUrl: t`Enter a valid URL`,
                required: field => t`${field} is required`,
            },
        );
    }, [uploadedFile, extractors, triggerSchemas, t]);

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
        nameRequiredMessage: t`Name is required`,
        isSubmitting,
    });
    const {
        parsedData,
        isParsing,
        isUploading,
        setUploadedFile,
    } = useImportFilePreparation({
        source: config.source,
        setConfig,
        uploadedFile,
        setUploadedFile: setUploadedFileState,
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
            ...(def?.sourceType ? {
                source: createImportTemplateSource(def.sourceType, def.fileFormat),
            } : {}),
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
        toast.success(t`Template selected`);
    }, [setConfig, setCurrentStep, t]);

    const handleStartFromScratch = React.useCallback(() => {
        setStartedFromScratch(true);
        setSelectedTemplate(null);
        setCurrentStep(0);
    }, [setCurrentStep]);

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
                        setUploadedFile={setUploadedFile}
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
                completeLabel={t`Create import`}
                completeIcon={Play}
                isSubmitting={isSubmitting}
            />
        </div>
    );
}
