import { useCallback, useMemo, useState } from 'react';
import { useLingui } from '@lingui/react/macro';

import type { StepConfigData } from '../shared/step-config';
import {
    DEFAULT_STEP_CONFIGS,
    MOVE_DIRECTION,
    PIPELINE_EDITOR_PANEL,
} from '../../constants';
import type { MoveDirection, PipelineEditorPanel } from '../../constants';
import {
    useAdapterCatalog,
    useHookStageCategories,
    useHookStages,
    useTriggerTypes,
} from '../../hooks';
import { FALLBACK_STAGE_CATEGORIES } from '../../constants';
import type {
    JsonObject,
    PipelineContext,
    PipelineEditorProps,
    PipelineStepDefinition,
    PipelineTrigger,
    StepType,
} from '../../types';
import { getCombinedTriggers, updateDefinitionWithTriggers } from '../../utils';
import { PipelineEditorDetails } from './PipelineEditorDetails';
import { PipelineEditorSidebar } from './PipelineEditorSidebar';
import {
    countPipelineHooks,
    getConfiguredHookStageGroups,
    getPipelineValidationErrors,
    getStepValidationErrors,
} from './pipeline-editor-view-model';
import {
    appendSimpleStep,
    canMoveSimpleStep,
    isSimpleLinearGraph,
    moveSimpleStep,
    removeSimpleStep,
    updateSimpleStep,
} from './simple-editor-graph';

export function PipelineEditor({
    definition,
    onChange,
    issues = [],
    readOnly = false,
}: PipelineEditorProps) {
    const { t } = useLingui();
    const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
    const [activePanel, setActivePanel] = useState<PipelineEditorPanel>(
        PIPELINE_EDITOR_PANEL.STEPS,
    );
    const {
        adapters,
        isLoading: catalogLoading,
        error: catalogError,
    } = useAdapterCatalog();
    const { configList: triggerTypes, isLoading: triggerTypesLoading } = useTriggerTypes();
    const { hookStages } = useHookStages();
    const { categories: backendCategories } = useHookStageCategories();
    const categories = useMemo(
        () => backendCategories.length > 0 ? backendCategories : FALLBACK_STAGE_CATEGORIES,
        [backendCategories],
    );
    const steps = definition.steps ?? [];
    const selectedStep = selectedStepIndex === null ? null : steps[selectedStepIndex];
    const simpleLinearGraph = isSimpleLinearGraph(definition);
    const combinedTriggers = useMemo(() => getCombinedTriggers(definition), [definition]);
    const hooks = useMemo(() => definition.hooks ?? {}, [definition.hooks]);
    const hookCount = useMemo(() => countPipelineHooks(hooks), [hooks]);
    const hookGroups = useMemo(
        () => getConfiguredHookStageGroups(categories, hookStages, hooks),
        [categories, hookStages, hooks],
    );
    const selectedStepErrors = useMemo(
        () => getStepValidationErrors(issues, selectedStep?.key),
        [issues, selectedStep?.key],
    );
    const pipelineContextErrors = useMemo(
        () => getPipelineValidationErrors(issues),
        [issues],
    );
    const hookStatusLabel = hookCount === 0
        ? t`No hooks configured`
        : hookCount === 1
            ? t`${hookCount} hook configured (read-only)`
            : t`${hookCount} hooks configured (read-only)`;

    const addStep = useCallback((type: StepType) => {
        const stepConfig = DEFAULT_STEP_CONFIGS[type];
        const newStep: PipelineStepDefinition = {
            key: `${type.toLowerCase()}-${Date.now()}`,
            type,
            config: stepConfig?.defaultConfig
                ? { ...stepConfig.defaultConfig } as JsonObject
                : {},
        };
        const updatedDefinition = appendSimpleStep(definition, newStep);
        onChange(updatedDefinition);
        setSelectedStepIndex(
            updatedDefinition.steps.findIndex(step => step.key === newStep.key),
        );
    }, [definition, onChange]);
    const removeStep = useCallback((index: number) => {
        onChange(removeSimpleStep(definition, index));
        setSelectedStepIndex(null);
    }, [definition, onChange]);
    const moveStep = useCallback((index: number, direction: MoveDirection) => {
        const targetIndex = direction === MOVE_DIRECTION.UP ? index - 1 : index + 1;
        if (!canMoveSimpleStep(definition, index, targetIndex)) return;
        onChange(moveSimpleStep(definition, index, targetIndex));
        setSelectedStepIndex(targetIndex);
    }, [definition, onChange]);
    const updateTriggers = useCallback((triggers: PipelineTrigger[]) => {
        onChange(updateDefinitionWithTriggers(definition, triggers));
    }, [definition, onChange]);
    const updateContext = useCallback((context: PipelineContext) => {
        onChange({ ...definition, context });
    }, [definition, onChange]);
    const updateSelectedStep = useCallback((updated: StepConfigData) => {
        if (selectedStepIndex === null || !selectedStep) return;
        onChange(updateSimpleStep(definition, selectedStepIndex, {
            ...selectedStep,
            key: updated.key,
            type: updated.type as StepType,
            adapterCode: updated.adapterCode || selectedStep.adapterCode,
            config: updated.config as JsonObject,
            context: updated.context,
            schemaRef: updated.schemaRef,
        }));
    }, [definition, onChange, selectedStep, selectedStepIndex]);
    const moveStepUp = useCallback(
        (index: number) => moveStep(index, MOVE_DIRECTION.UP),
        [moveStep],
    );
    const moveStepDown = useCallback(
        (index: number) => moveStep(index, MOVE_DIRECTION.DOWN),
        [moveStep],
    );

    return (
        <div className="flex min-h-0 h-full flex-col md:flex-row border rounded-lg overflow-hidden bg-background">
            <PipelineEditorSidebar
                activePanel={activePanel}
                definition={definition}
                selectedStepIndex={selectedStepIndex}
                issues={issues}
                readOnly={readOnly}
                simpleLinearGraph={simpleLinearGraph}
                combinedTriggers={combinedTriggers}
                pipelineContextErrors={pipelineContextErrors}
                hookGroups={hookGroups}
                hookCount={hookCount}
                hookStatusLabel={hookStatusLabel}
                onPanelChange={setActivePanel}
                onStepClick={setSelectedStepIndex}
                onMoveStepUp={moveStepUp}
                onMoveStepDown={moveStepDown}
                onRemoveStep={removeStep}
                onAddStep={addStep}
                onTriggersChange={updateTriggers}
                onContextChange={updateContext}
            />
            <div className="min-w-0 flex-1 overflow-auto">
                <PipelineEditorDetails
                    activePanel={activePanel}
                    selectedStep={selectedStep}
                    readOnly={readOnly}
                    adapters={adapters}
                    catalogLoading={catalogLoading}
                    catalogError={catalogError}
                    selectedStepErrors={selectedStepErrors}
                    triggerTypes={triggerTypes}
                    triggerTypesLoading={triggerTypesLoading}
                    hookGroups={hookGroups}
                    hookCount={hookCount}
                    onStepChange={updateSelectedStep}
                />
            </div>
        </div>
    );
}
