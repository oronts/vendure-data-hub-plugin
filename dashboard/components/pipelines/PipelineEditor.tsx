import * as React from 'react';
import { useCallback, useMemo, useState, memo } from 'react';
import { Button } from '@vendure/dashboard';
import {
    Play,
    Settings,
    Clock,
    AlertTriangle,
    Zap,
    Bell,
} from 'lucide-react';
import { TriggersPanel } from '../shared/triggers-panel';
import { StepConfigPanel } from '../shared/step-config';
import { PipelineSettingsPanel, StepListItem } from './shared';
import {
    MOVE_DIRECTION,
    STEP_CONFIGS,
    STEP_TYPES,
    getStepTypeIcon,
} from '../../constants';
import type { MoveDirection } from '../../constants';
import { PIPELINE_EDITOR_PANEL } from '../../constants/ui-states';
import type { PipelineEditorPanel } from '../../constants/ui-states';
import { useAdapterCatalog } from '../../hooks';
import type {
    StepType,
    PipelineStepDefinition,
    PipelineTrigger,
    PipelineEditorProps,
    JsonObject,
} from '../../types';
import { getCombinedTriggers, updateDefinitionWithTriggers } from '../../utils';

export function PipelineEditor({ definition, onChange, issues = [] }: PipelineEditorProps) {
    const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
    const [activePanel, setActivePanel] = useState<PipelineEditorPanel>(PIPELINE_EDITOR_PANEL.STEPS);

    const { adapters, connectionCodes, secretOptions } = useAdapterCatalog();

    const steps = definition.steps ?? [];
    const selectedStep = selectedStepIndex !== null ? steps[selectedStepIndex] : null;

    const addStep = useCallback((type: StepType) => {
        const defaultConfig: JsonObject = {};

        switch (type) {
            case STEP_TYPES.TRIGGER:
                defaultConfig.type = 'manual';
                defaultConfig.enabled = true;
                break;
            case STEP_TYPES.VALIDATE:
                defaultConfig.mode = 'FAIL_FAST';
                break;
            case STEP_TYPES.ROUTE:
                defaultConfig.branches = [];
                break;
            default:
                break;
        }

        const newStep: PipelineStepDefinition = {
            key: `${type.toLowerCase()}-${Date.now()}`,
            type,
            config: defaultConfig,
        };

        const existingEdges = definition.edges ?? [];
        const currentSteps = definition.steps ?? [];

        let newEdges = existingEdges;

        if (type === STEP_TYPES.TRIGGER) {
            // TRIGGER steps connect TO the first non-trigger step (parallel entry points)
            const firstExecutionStep = currentSteps.find(s => s.type !== STEP_TYPES.TRIGGER);
            if (firstExecutionStep) {
                newEdges = [
                    ...existingEdges,
                    { from: newStep.key, to: firstExecutionStep.key },
                ];
            }
        } else if (existingEdges.length > 0 && currentSteps.length > 0) {
            // Non-trigger steps chain to the last step
            const lastStep = currentSteps[currentSteps.length - 1];
            if (lastStep) {
                newEdges = [
                    ...existingEdges,
                    { from: lastStep.key, to: newStep.key },
                ];
            }
        }

        onChange({
            ...definition,
            steps: [...currentSteps, newStep],
            edges: newEdges,
        });
        setSelectedStepIndex(currentSteps.length);
    }, [definition, onChange]);

    const updateStep = useCallback((index: number, updatedStep: PipelineStepDefinition) => {
        const currentSteps = definition.steps ?? [];
        const newSteps = [...currentSteps];
        newSteps[index] = updatedStep;
        onChange({ ...definition, steps: newSteps });
    }, [definition, onChange]);

    const removeStep = useCallback((index: number) => {
        const currentSteps = definition.steps ?? [];
        const stepToRemove = currentSteps[index];
        const stepKey = stepToRemove?.key;
        const newSteps = currentSteps.filter((_, i) => i !== index);

        const existingEdges = definition.edges ?? [];
        const incomingEdges = existingEdges.filter(edge => edge.to === stepKey);
        const outgoingEdges = existingEdges.filter(edge => edge.from === stepKey);

        let newEdges = existingEdges.filter(
            edge => edge.from !== stepKey && edge.to !== stepKey
        );

        if (incomingEdges.length > 0 && outgoingEdges.length > 0) {
            const reconnectionEdges: Array<{ from: string; to: string; branch?: string }> = [];
            for (const inEdge of incomingEdges) {
                for (const outEdge of outgoingEdges) {
                    const edgeExists = newEdges.some(
                        e => e.from === inEdge.from && e.to === outEdge.to
                    );
                    if (!edgeExists) {
                        reconnectionEdges.push({
                            from: inEdge.from,
                            to: outEdge.to,
                            ...(inEdge.branch ? { branch: inEdge.branch } : {}),
                        });
                    }
                }
            }
            if (reconnectionEdges.length > 0) {
                newEdges = [...newEdges, ...reconnectionEdges];
            }
        }

        onChange({ ...definition, steps: newSteps, edges: newEdges });
        setSelectedStepIndex(null);
    }, [definition, onChange]);

    const moveStep = useCallback((index: number, direction: MoveDirection) => {
        const currentSteps = definition.steps ?? [];
        if (direction === MOVE_DIRECTION.UP && index === 0) return;
        if (direction === MOVE_DIRECTION.DOWN && index === currentSteps.length - 1) return;

        const newSteps = [...currentSteps];
        const targetIndex = direction === MOVE_DIRECTION.UP ? index - 1 : index + 1;
        [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
        onChange({ ...definition, steps: newSteps });
        setSelectedStepIndex(targetIndex);
    }, [definition, onChange]);

    // Sync triggers between steps and triggers array
    // Both visual trigger nodes (in steps) and Triggers tab edit the same data
    const updateTriggers = useCallback((triggers: PipelineTrigger[]) => {
        onChange(updateDefinitionWithTriggers(definition, triggers));
    }, [definition, onChange]);

    // Get combined triggers from both steps and triggers array
    const combinedTriggers = useMemo(() => getCombinedTriggers(definition), [definition]);

    // Panel switch handlers
    const handleSwitchToSteps = useCallback(() => setActivePanel(PIPELINE_EDITOR_PANEL.STEPS), []);
    const handleSwitchToTriggers = useCallback(() => setActivePanel(PIPELINE_EDITOR_PANEL.TRIGGERS), []);
    const handleSwitchToSettings = useCallback(() => setActivePanel(PIPELINE_EDITOR_PANEL.SETTINGS), []);

    // Settings change handler
    const handleContextChange = useCallback((context: JsonObject) => {
        onChange({ ...definition, context });
    }, [definition, onChange]);

    // Step selection handler factory - memoized per step index
    const handleStepClick = useCallback((index: number) => {
        setSelectedStepIndex(index);
    }, []);

    // Step action handler factories
    const handleMoveStepUp = useCallback((index: number) => {
        moveStep(index, MOVE_DIRECTION.UP);
    }, [moveStep]);

    const handleMoveStepDown = useCallback((index: number) => {
        moveStep(index, MOVE_DIRECTION.DOWN);
    }, [moveStep]);

    const handleRemoveStep = useCallback((index: number) => {
        removeStep(index);
    }, [removeStep]);

    // Selected step update handler
    const handleSelectedStepChange = useCallback((updated: { key: string; type: string; config: JsonObject; adapterCode?: string }) => {
        if (selectedStepIndex === null || !selectedStep) return;
        updateStep(selectedStepIndex, {
            ...selectedStep,
            key: updated.key,
            type: updated.type as StepType,
            config: { ...updated.config, adapterCode: updated.adapterCode },
        });
    }, [selectedStepIndex, selectedStep, updateStep]);

    return (
        <div className="flex h-full border rounded-lg overflow-hidden bg-background">
            <div className="w-80 border-r flex flex-col">
                <div className="border-b">
                    <div className="flex" role="tablist" aria-label="Pipeline editor panels">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activePanel === PIPELINE_EDITOR_PANEL.STEPS}
                            aria-controls="panel-steps"
                            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                activePanel === PIPELINE_EDITOR_PANEL.STEPS
                                    ? 'bg-primary/10 text-primary border-b-2 border-primary'
                                    : 'text-muted-foreground hover:bg-muted'
                            }`}
                            onClick={handleSwitchToSteps}
                            data-testid="datahub-editor-tab-steps"
                        >
                            <Play className="h-3 w-3 inline mr-1" />
                            Steps
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activePanel === PIPELINE_EDITOR_PANEL.TRIGGERS}
                            aria-controls="panel-triggers"
                            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                activePanel === PIPELINE_EDITOR_PANEL.TRIGGERS
                                    ? 'bg-primary/10 text-primary border-b-2 border-primary'
                                    : 'text-muted-foreground hover:bg-muted'
                            }`}
                            onClick={handleSwitchToTriggers}
                            data-testid="datahub-editor-tab-triggers"
                        >
                            <Bell className="h-3 w-3 inline mr-1" />
                            Triggers
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activePanel === PIPELINE_EDITOR_PANEL.SETTINGS}
                            aria-controls="panel-settings"
                            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                activePanel === PIPELINE_EDITOR_PANEL.SETTINGS
                                    ? 'bg-primary/10 text-primary border-b-2 border-primary'
                                    : 'text-muted-foreground hover:bg-muted'
                            }`}
                            onClick={handleSwitchToSettings}
                            data-testid="datahub-editor-tab-settings"
                        >
                            <Settings className="h-3 w-3 inline mr-1" />
                            Settings
                        </button>
                    </div>
                </div>

                {activePanel === PIPELINE_EDITOR_PANEL.STEPS && (
                    <>
                        <div className="p-3 border-b bg-muted/50">
                            <h3 className="font-semibold text-sm">Pipeline Steps</h3>
                            <p className="text-xs text-muted-foreground">Click to configure each step</p>
                        </div>
                        <div className="flex-1 overflow-auto p-2 space-y-1">
                            {steps.map((step, index) => (
                                <StepListItemWrapper
                                    key={step.key}
                                    step={step}
                                    index={index}
                                    edges={definition.edges ?? []}
                                    selectedStepIndex={selectedStepIndex}
                                    stepsLength={steps.length}
                                    issues={issues}
                                    onStepClick={handleStepClick}
                                    onMoveUp={handleMoveStepUp}
                                    onMoveDown={handleMoveStepDown}
                                    onRemove={handleRemoveStep}
                                />
                            ))}
                            {steps.length === 0 && (
                                <div className="p-4 text-center text-muted-foreground text-sm">
                                    No steps yet. Add a step to get started.
                                </div>
                            )}
                        </div>
                        <div className="p-3 border-t bg-muted/50">
                            <p className="text-xs text-muted-foreground mb-2">Add Step:</p>
                            <div className="grid grid-cols-3 gap-1" data-testid="datahub-editor-add-step-buttons">
                                {([STEP_TYPES.TRIGGER, STEP_TYPES.EXTRACT, STEP_TYPES.TRANSFORM, STEP_TYPES.VALIDATE, STEP_TYPES.ENRICH, STEP_TYPES.LOAD, STEP_TYPES.EXPORT, STEP_TYPES.FEED, STEP_TYPES.SINK] as StepType[]).map((type) => (
                                    <AddStepButton
                                        key={type}
                                        type={type}
                                        onAddStep={addStep}
                                    />
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {activePanel === PIPELINE_EDITOR_PANEL.TRIGGERS && (
                    <TriggersPanel
                        triggers={combinedTriggers}
                        onChange={updateTriggers}
                        variant="compact"
                    />
                )}

                {activePanel === PIPELINE_EDITOR_PANEL.SETTINGS && (
                    <PipelineSettingsPanel
                        context={definition.context ?? {}}
                        onChange={handleContextChange}
                    />
                )}
            </div>

            <div className="flex-1 overflow-auto">
                {activePanel === PIPELINE_EDITOR_PANEL.STEPS && selectedStep ? (
                    <div className="p-4">
                        <StepConfigPanel
                            data={{
                                key: selectedStep.key,
                                type: selectedStep.type,
                                config: selectedStep.config ?? {},
                                adapterCode: selectedStep.config?.adapterCode as string | undefined,
                            }}
                            onChange={handleSelectedStepChange}
                            catalog={adapters}
                            connectionCodes={connectionCodes}
                            secretOptions={secretOptions}
                            variant="inline"
                            showHeader={true}
                            showDeleteButton={false}
                            showKeyInput={true}
                            showCheatSheet={true}
                            showStepTester={true}
                            showAdvancedEditors={true}
                        />
                    </div>
                ) : activePanel === PIPELINE_EDITOR_PANEL.STEPS ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        <div className="text-center">
                            <p className="text-sm">Select a step to configure</p>
                            <p className="text-xs mt-1">or add a new step from the left panel</p>
                        </div>
                    </div>
                ) : activePanel === PIPELINE_EDITOR_PANEL.TRIGGERS ? (
                    <div className="p-6">
                        <h3 className="font-semibold mb-4">Trigger Configuration</h3>
                        <p className="text-sm text-muted-foreground">
                            Configure how and when this pipeline runs. You can have multiple triggers -
                            for example, run on a schedule AND allow manual triggering.
                        </p>
                        <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                            <h4 className="text-sm font-medium mb-2">Trigger Types:</h4>
                            <ul className="text-sm text-muted-foreground space-y-1">
                                <li><strong>Manual</strong> - Run from dashboard or API</li>
                                <li><strong>Schedule</strong> - Run on cron schedule</li>
                                <li><strong>Webhook</strong> - Run when webhook is called</li>
                                <li><strong>Event</strong> - Run when Vendure event fires</li>
                                <li><strong>File Watch</strong> - Run when files appear</li>
                            </ul>
                        </div>
                    </div>
                ) : (
                    <div className="p-6">
                        <h3 className="font-semibold mb-4">Pipeline Settings</h3>
                        <p className="text-sm text-muted-foreground">
                            Configure execution behavior including error handling, checkpointing for
                            resumable runs, and throughput controls.
                        </p>
                        <div className="mt-4 space-y-4">
                            <div className="p-4 bg-muted/50 rounded-lg">
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                    Error Handling
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                    Configure retries, backoff, and dead letter queue for failed records.
                                </p>
                            </div>
                            <div className="p-4 bg-muted/50 rounded-lg">
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-blue-500" />
                                    Checkpointing
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                    Enable resumable execution with periodic checkpoints.
                                </p>
                            </div>
                            <div className="p-4 bg-muted/50 rounded-lg">
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-green-500" />
                                    Throughput
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                    Control batch size, concurrency, and rate limiting.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

interface StepListItemWrapperProps {
    step: PipelineStepDefinition;
    index: number;
    edges: Array<{ from: string; to: string }>;
    selectedStepIndex: number | null;
    stepsLength: number;
    issues: Array<{ stepKey?: string }>;
    onStepClick: (index: number) => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
    onRemove: (index: number) => void;
}

const StepListItemWrapper = memo(function StepListItemWrapper({
    step,
    index,
    edges,
    selectedStepIndex,
    stepsLength,
    issues,
    onStepClick,
    onMoveUp,
    onMoveDown,
    onRemove,
}: StepListItemWrapperProps) {
    const connectionCount = edges.filter(
        e => e.from === step.key || e.to === step.key
    ).length;

    const handleClick = useCallback(() => {
        onStepClick(index);
    }, [index, onStepClick]);

    const handleMoveUp = useCallback(() => {
        onMoveUp(index);
    }, [index, onMoveUp]);

    const handleMoveDown = useCallback(() => {
        onMoveDown(index);
    }, [index, onMoveDown]);

    const handleRemove = useCallback(() => {
        onRemove(index);
    }, [index, onRemove]);

    return (
        <StepListItem
            step={step}
            index={index}
            isSelected={selectedStepIndex === index}
            onClick={handleClick}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onRemove={handleRemove}
            isFirst={index === 0}
            isLast={index === stepsLength - 1}
            issueCount={issues.filter(i => i.stepKey === step.key).length}
            connectionCount={connectionCount}
        />
    );
});

interface AddStepButtonProps {
    type: StepType;
    onAddStep: (type: StepType) => void;
}

const AddStepButton = memo(function AddStepButton({ type, onAddStep }: AddStepButtonProps) {
    const config = STEP_CONFIGS[type];
    const Icon = getStepTypeIcon(type) ?? Play;

    const handleClick = useCallback(() => {
        onAddStep(type);
    }, [type, onAddStep]);

    return (
        <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={handleClick}
            title={config?.description}
            data-testid={`datahub-editor-add-step-${type.toLowerCase()}`}
        >
            <Icon className="h-3 w-3 mr-1" />
            {config?.label ?? type}
        </Button>
    );
});
