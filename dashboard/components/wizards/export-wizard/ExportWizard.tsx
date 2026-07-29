import * as React from "react";
import { useLingui } from "@lingui/react/macro";
import { Download } from "lucide-react";
import { toast } from "sonner";
import {
  WIZARD_STEPS,
  EXPORT_STEP_ID,
  DEFAULT_EXPORT_OPTIONS,
} from "./constants";
import {
  EXPORT_FORMAT,
  TRIGGER_TYPE,
} from "../../../constants";
import type {
  ExportWizardProps,
  ExportConfiguration,
} from "./types";
import { SourceStep } from "./SourceStep";
import { FieldsStep } from "./FieldsStep";
import { FormatStep } from "./FormatStep";
import { DestinationStep } from "./DestinationStep";
import { TriggerStep } from "./TriggerStep";
import { ReviewStep } from "./ReviewStep";
import { validateExportWizardStep } from "../../../utils";
import {
  WizardProgressBar,
  WizardFooter,
  ValidationErrorDisplay,
} from "../../shared";
import { useExportTemplates } from "../../../hooks/use-export-templates";
import type { ExportTemplate } from "../../../hooks/use-export-templates";
import { useWizardNavigation } from "../../../hooks/use-wizard-navigation";
import { useExportEntitySchemas } from "../../../hooks/api/use-export-entity-schemas";
import {
  useDestinationSchemas,
  useTriggerTypeSchemas,
} from "../../../hooks/api/use-config-options";
import { localizeExportWizardValidation } from "./localize-validation";
import { TemplateQuickStart } from "./TemplateQuickStart";
import { reconcileSourceFields } from "./source-fields";

export function ExportWizard({
  onComplete,
  onCancel,
  initialConfig,
  isSubmitting,
}: ExportWizardProps) {
  const { t } = useLingui();
  const stepLabels: Record<string, string> = {
    source: t`Data Source`,
    fields: t`Select Fields`,
    format: t`Output Format`,
    destination: t`Destination`,
    trigger: t`Schedule`,
    review: t`Review`,
  };
  const localizedSteps = WIZARD_STEPS.map((step) => ({
    ...step,
    label: stepLabels[step.id] ?? step.label,
  }));
  const [selectedTemplate, setSelectedTemplate] =
    React.useState<ExportTemplate | null>(null);
  const {
    templates: exportTemplates,
    isLoading: templatesLoading,
    isError: templatesFailed,
    error: templatesError,
    refetch: refetchTemplates,
  } = useExportTemplates();
  const {
    getFieldNames: getBackendFieldNames,
    isLoading: entityFieldsLoading,
    isError: entityFieldsFailed,
  } = useExportEntitySchemas();
  const { schemas: destinationSchemas } = useDestinationSchemas();
  const { schemas: triggerSchemas } = useTriggerTypeSchemas();

  const validateStep = React.useCallback(
    (stepId: string, cfg: Partial<ExportConfiguration>) => {
      const result = validateExportWizardStep(
        stepId,
        cfg,
        destinationSchemas,
        triggerSchemas,
      );
      return localizeExportWizardValidation(
        result,
        {
          stepId,
          config: cfg,
          destinationSchemas,
          triggerSchemas,
        },
        {
          sourceRequired: t`Select a data source`,
          duplicateOutputNames: names => t`Output names must be unique: ${names}`,
          selectField: t`Select at least one field`,
          outputName: t`Output name is required`,
          formatRequired: t`Select an output format`,
          nameRequired: t`Export name is required`,
          unsupportedDestination: type => t`Unsupported destination type: ${type}`,
          invalidUrl: t`Enter a valid URL`,
          required: field => t`${field} is required`,
        },
      );
    },
    [destinationSchemas, t, triggerSchemas],
  );

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
    steps: localizedSteps,
    initialConfig: initialConfig ?? {
      name: "",
      sourceEntity: "",
      sourceQuery: { type: "all", orderBy: "id", orderDirection: "ASC" },
      filters: [],
      fields: [],
      format: {
        type: EXPORT_FORMAT.CSV,
        options: { delimiter: ",", includeHeaders: true },
      },
      destination: { type: "LOCAL", localConfig: { directory: "." } },
      trigger: { type: TRIGGER_TYPE.MANUAL },
      options: { ...DEFAULT_EXPORT_OPTIONS },
    },
    validateStep,
    onComplete: onComplete as (config: Partial<ExportConfiguration>) => void,
    nameRequiredMessage: t`Export name is required`,
    isSubmitting,
  });
  const prevSourceEntityRef = React.useRef<string | undefined>(undefined);
  const preserveInitialFieldsRef = React.useRef(
    Boolean(initialConfig?.sourceEntity && initialConfig.fields?.length),
  );

  const handleUseTemplate = React.useCallback(
    (template: ExportTemplate) => {
      setSelectedTemplate(template);
      const def = template.definition;
      setConfig((prev) => {
        const sourceEntity = def?.sourceEntity ?? prev.sourceEntity;
        const templateFields = def?.fields?.map((field) => ({
          ...field,
          include: true,
        }));
        const fields = sourceEntity
          ? reconcileSourceFields({
              currentFields: templateFields ?? prev.fields ?? [],
              fieldNames: getBackendFieldNames(sourceEntity),
              preserveCurrentFields: Boolean(templateFields?.length) || !def?.sourceEntity,
            })
          : [];
        prevSourceEntityRef.current = sourceEntity;

        return {
          ...prev,
          name: template.name,
          sourceEntity,
          fields,
          format: {
            type: template.format as ExportConfiguration["format"]["type"],
            options: {
              ...(prev.format?.type === template.format ? prev.format.options : {}),
              ...(def?.formatOptions ?? {}),
            },
          },
        };
      });
      setCurrentStep(0);
      toast.success(
        t`Template selected`,
      );
    },
    [getBackendFieldNames, setConfig, setCurrentStep, t],
  );

  React.useEffect(() => {
    if (
      !config.sourceEntity ||
      entityFieldsLoading ||
      entityFieldsFailed ||
      config.sourceEntity === prevSourceEntityRef.current
    ) {
      return;
    }

    prevSourceEntityRef.current = config.sourceEntity;
    const preserveCurrentFields = preserveInitialFieldsRef.current;
    preserveInitialFieldsRef.current = false;
    const fields = reconcileSourceFields({
      currentFields: config.fields ?? [],
      fieldNames: getBackendFieldNames(config.sourceEntity),
      preserveCurrentFields,
    });
    setConfig((prev) => ({ ...prev, fields }));
    setStepErrors({});
    setAttemptedNext(false);
  }, [
    config.fields,
    config.sourceEntity,
    entityFieldsFailed,
    entityFieldsLoading,
    getBackendFieldNames,
    setConfig,
    setStepErrors,
    setAttemptedNext,
  ]);

  return (
    <div
      className="flex h-full min-w-0 max-w-full flex-col overflow-hidden"
      data-testid="datahub-exportwizard-wizard"
    >
      <WizardProgressBar
        steps={localizedSteps}
        currentStep={currentStep}
        onStepClick={handleStepClick}
      />

      {!selectedTemplate && currentStep === 0 && (
        <div className="min-w-0 px-4 pt-4 sm:px-6">
          <TemplateQuickStart
            templates={exportTemplates}
            isLoading={templatesLoading}
            isError={templatesFailed}
            error={templatesError}
            onRetry={() => void refetchTemplates()}
            onUseTemplate={handleUseTemplate}
          />
        </div>
      )}

      <div
        className="min-w-0 flex-1 overflow-auto p-4 sm:p-6"
        data-testid="datahub-exportwizard-steps"
      >
        <ValidationErrorDisplay
          errors={stepErrors}
          show={attemptedNext}
          title={t`Fix the following errors to continue`}
        />

        {WIZARD_STEPS[currentStep].id === EXPORT_STEP_ID.SOURCE && (
          <SourceStep config={config} updateConfig={updateConfig} />
        )}

        {WIZARD_STEPS[currentStep].id === EXPORT_STEP_ID.FIELDS && (
          <FieldsStep config={config} updateConfig={updateConfig} />
        )}

        {WIZARD_STEPS[currentStep].id === EXPORT_STEP_ID.FORMAT && (
          <FormatStep config={config} updateConfig={updateConfig} />
        )}

        {WIZARD_STEPS[currentStep].id === EXPORT_STEP_ID.DESTINATION && (
          <DestinationStep config={config} updateConfig={updateConfig} />
        )}

        {WIZARD_STEPS[currentStep].id === EXPORT_STEP_ID.TRIGGER && (
          <TriggerStep config={config} updateConfig={updateConfig} />
        )}

        {WIZARD_STEPS[currentStep].id === EXPORT_STEP_ID.REVIEW && (
          <ReviewStep
            config={config}
            updateConfig={updateConfig}
            errors={attemptedNext ? stepErrors : {}}
          />
        )}
      </div>

      <WizardFooter
        currentStep={currentStep}
        totalSteps={localizedSteps.length}
        canProceed={canProceed}
        onBack={handleBack}
        onNext={handleNext}
        onComplete={handleComplete}
        onCancel={onCancel}
        completeLabel={t`Create Export`}
        completeIcon={Download}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
