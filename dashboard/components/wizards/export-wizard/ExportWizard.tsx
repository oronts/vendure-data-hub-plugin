import * as React from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@vendure/dashboard';
import { VENDURE_ENTITY_SCHEMAS } from '../../../../shared';
import { WIZARD_STEPS, EXPORT_STEP_ID, DEFAULT_EXPORT_OPTIONS } from './constants';
import { QUERY_LIMITS, TRIGGER_TYPE, EXPORT_FORMAT, TOAST_WIZARD } from '../../../constants';
import type { ExportWizardProps, ExportConfiguration, ExportField } from './types';
import { SourceStep } from './SourceStep';
import { FieldsStep } from './FieldsStep';
import { FormatStep } from './FormatStep';
import { DestinationStep } from './DestinationStep';
import { TriggerStep } from './TriggerStep';
import { ReviewStep } from './ReviewStep';
import { validateExportWizardStep } from '../../../utils';
import { WizardProgressBar, WizardFooter, ValidationErrorDisplay, SelectableCard, SelectableCardGrid } from '../../shared';
import { useExportTemplates } from '../../../hooks/use-export-templates';
import type { ExportTemplate } from '../../../hooks/use-export-templates';
import { useWizardNavigation } from '../../../hooks/use-wizard-navigation';
import { useEntityFieldSchemas } from '../../../hooks/api/use-entity-field-schemas';
import { useDestinationSchemas, useTriggerTypeSchemas } from '../../../hooks/api/use-config-options';

const QUICK_START_TEMPLATE_COUNT = 4;

function getSchemaFieldDefault(schemas: Array<{ type: string; fields: Array<{ key: string; defaultValue?: unknown }> }>, type: string, key: string, fallback: string): string {
    const schema = schemas.find(s => s.type === type);
    const field = schema?.fields.find(f => f.key === key);
    return typeof field?.defaultValue === 'string' ? field.defaultValue : fallback;
}

export function ExportWizard({ onComplete, onCancel, initialConfig, isSubmitting }: ExportWizardProps) {
    const [selectedTemplate, setSelectedTemplate] = React.useState<ExportTemplate | null>(null);
    const { templates: exportTemplates } = useExportTemplates();
    const { getFieldNames: getBackendFieldNames } = useEntityFieldSchemas();
    const { schemas: destinationSchemas } = useDestinationSchemas();
    const { schemas: triggerSchemas } = useTriggerTypeSchemas();

    const fileDefaults = React.useMemo(() => ({
        directory: getSchemaFieldDefault(destinationSchemas, 'FILE', 'directory', '/exports'),
        filename: getSchemaFieldDefault(destinationSchemas, 'FILE', 'filename', 'export.csv'),
    }), [destinationSchemas]);

    const validateStep = React.useCallback((stepId: string, cfg: Partial<ExportConfiguration>) => {
        return validateExportWizardStep(stepId, cfg, destinationSchemas, triggerSchemas);
    }, [destinationSchemas, triggerSchemas]);

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
    } = useWizardNavigation<Partial<ExportConfiguration>>({
        steps: WIZARD_STEPS,
        initialConfig: initialConfig ?? {
            name: '',
            sourceEntity: '',
            sourceQuery: { type: 'all', limit: QUERY_LIMITS.EXPORT_DEFAULT, orderBy: 'id', orderDirection: 'ASC' },
            filters: [],
            fields: [],
            format: { type: EXPORT_FORMAT.CSV, options: { delimiter: ',', includeHeaders: true } },
            destination: { type: 'FILE', fileConfig: { directory: fileDefaults.directory, filename: fileDefaults.filename } },
            trigger: { type: TRIGGER_TYPE.MANUAL },
            options: { ...DEFAULT_EXPORT_OPTIONS },
        },
        validateStep,
        onComplete: onComplete as (config: Partial<ExportConfiguration>) => void,
        nameRequiredMessage: TOAST_WIZARD.EXPORT_NAME_REQUIRED,
        isSubmitting,
    });

    const handleUseTemplate = React.useCallback((template: ExportTemplate) => {
        setSelectedTemplate(template);
        const def = template.definition;
        setConfig(prev => ({
            ...prev,
            name: template.name,
            ...(def?.sourceEntity ? { sourceEntity: def.sourceEntity } : {}),
            ...(def?.format ? {
                format: {
                    type: def.format as ExportConfiguration['format']['type'],
                    options: {
                        ...prev.format?.options,
                        ...(def.formatOptions ?? {}),
                    },
                },
            } : {}),
            ...(def?.fields?.length ? {
                fields: def.fields.map(f => ({
                    sourceField: f.sourceField,
                    outputName: f.outputName,
                    include: true,
                })),
            } : {}),
        }));
        setCurrentStep(0);
        toast.success(TOAST_WIZARD.TEMPLATE_SELECTED);
    }, [setConfig, setCurrentStep]);

    // Track previous sourceEntity to detect changes and avoid re-running on same value
    const prevSourceEntityRef = React.useRef<string | undefined>(undefined);

    React.useEffect(() => {
        // eslint-disable-next-line react-hooks/exhaustive-deps -- config.fields intentionally excluded: effect SETS fields, including it would cause infinite loop
        // Only run when sourceEntity actually changes, not on every render
        if (config.sourceEntity && config.sourceEntity !== prevSourceEntityRef.current) {
            prevSourceEntityRef.current = config.sourceEntity;

            // Use backend field names as primary source, fall back to static schemas during loading
            const backendNames = getBackendFieldNames(config.sourceEntity);
            const fieldNames = backendNames.length > 0
                ? backendNames
                : Object.keys(VENDURE_ENTITY_SCHEMAS[config.sourceEntity]?.fields ?? {});

            if (fieldNames.length > 0) {
                // If template fields are already set, don't override with auto-detected fields
                if (config.fields && config.fields.length > 0 && selectedTemplate) {
                    return;
                }
                const fields: ExportField[] = fieldNames.map(name => ({
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
    }, [config.sourceEntity, selectedTemplate, getBackendFieldNames, setConfig, setStepErrors, setAttemptedNext]);

    return (
        <div className="flex flex-col h-full" data-testid="datahub-exportwizard-wizard">
            <WizardProgressBar
                steps={WIZARD_STEPS}
                currentStep={currentStep}
                onStepClick={handleStepClick}
            />

            {!selectedTemplate && currentStep === 0 && exportTemplates.length > 0 && (
                <div className="px-6 pt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Quick Start with a Template</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <SelectableCardGrid columns={4}>
                                {exportTemplates.slice(0, QUICK_START_TEMPLATE_COUNT).map(template => (
                                    <SelectableCard
                                        key={template.id}
                                        title={template.name}
                                        description={template.description}
                                        selected={false}
                                        onClick={() => handleUseTemplate(template)}
                                        data-testid={`datahub-export-template-${template.id}-btn`}
                                    />
                                ))}
                            </SelectableCardGrid>
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="flex-1 overflow-auto p-6" data-testid="datahub-exportwizard-steps">
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
                isSubmitting={isSubmitting}
            />
        </div>
    );
}
