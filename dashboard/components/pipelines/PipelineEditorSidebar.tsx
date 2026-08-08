import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button, Tabs, TabsList, TabsTrigger } from '@vendure/dashboard';
import { Bell, Play, Settings, Webhook } from 'lucide-react';

import { TriggersPanel } from '../shared/triggers-panel';
import { PipelineSettingsPanel, StepListItem } from './shared';
import {
    DEFAULT_STEP_CONFIGS,
    getStepTypeIcon,
    PIPELINE_EDITOR_PANEL,
    STEP_TYPE,
} from '../../constants';
import type { PipelineEditorPanel } from '../../constants';
import { useStepConfigs } from '../../hooks';
import type {
    PipelineContext,
    PipelineDefinition,
    PipelineStepDefinition,
    PipelineTrigger,
    StepType,
    ValidationIssue,
} from '../../types';
import { canMoveSimpleStep } from './simple-editor-graph';
import type { ConfiguredHookStageGroup } from './pipeline-editor-view-model';
import { PipelineHooksView } from './PipelineHooksView';

const ADDABLE_STEP_TYPES = Object.keys(DEFAULT_STEP_CONFIGS).filter(
    type => type !== STEP_TYPE.ROUTE && type !== STEP_TYPE.GATE,
) as StepType[];

interface PipelineEditorSidebarProps {
    readonly activePanel: PipelineEditorPanel;
    readonly definition: PipelineDefinition;
    readonly selectedStepIndex: number | null;
    readonly issues: readonly ValidationIssue[];
    readonly readOnly: boolean;
    readonly simpleLinearGraph: boolean;
    readonly combinedTriggers: PipelineTrigger[];
    readonly pipelineContextErrors: Record<string, string>;
    readonly hookGroups: readonly ConfiguredHookStageGroup[];
    readonly hookCount: number;
    readonly hookStatusLabel: string;
    readonly onPanelChange: (panel: PipelineEditorPanel) => void;
    readonly onStepClick: (index: number) => void;
    readonly onMoveStepUp: (index: number) => void;
    readonly onMoveStepDown: (index: number) => void;
    readonly onRemoveStep: (index: number) => void;
    readonly onAddStep: (type: StepType) => void;
    readonly onTriggersChange: (triggers: PipelineTrigger[]) => void;
    readonly onContextChange: (context: PipelineContext) => void;
}

export function PipelineEditorSidebar(props: PipelineEditorSidebarProps) {
    const { t } = useLingui();
    const { activePanel, hookCount, onPanelChange } = props;
    return (
        <Tabs
            value={activePanel}
            onValueChange={value => onPanelChange(value as PipelineEditorPanel)}
            className="w-full shrink-0 gap-0 border-b md:w-80 md:border-b-0 md:border-r"
        >
            <div className="border-b">
                <TabsList
                    aria-label={t`Pipeline editor panels`}
                    className="grid h-auto w-full grid-cols-4 rounded-none bg-transparent p-1"
                >
                    <EditorTab value={PIPELINE_EDITOR_PANEL.STEPS} icon={Play} testId="datahub-editor-tab-steps">
                        <Trans>Steps</Trans>
                    </EditorTab>
                    <EditorTab value={PIPELINE_EDITOR_PANEL.TRIGGERS} icon={Bell} testId="datahub-editor-tab-triggers">
                        <Trans>Triggers</Trans>
                    </EditorTab>
                    <EditorTab value={PIPELINE_EDITOR_PANEL.SETTINGS} icon={Settings} testId="datahub-editor-tab-settings">
                        <Trans>Settings</Trans>
                    </EditorTab>
                    <EditorTab value={PIPELINE_EDITOR_PANEL.HOOKS} icon={Webhook} testId="datahub-editor-tab-hooks" count={hookCount}>
                        <Trans>Hooks</Trans>
                    </EditorTab>
                </TabsList>
            </div>
            <SidebarPanel {...props} />
        </Tabs>
    );
}

function EditorTab({
    value,
    icon: Icon,
    testId,
    count = 0,
    children,
}: {
    readonly value: PipelineEditorPanel;
    readonly icon: typeof Play;
    readonly testId: string;
    readonly count?: number;
    readonly children: ReactNode;
}) {
    return (
        <TabsTrigger
            value={value}
            className="min-w-0 px-1 text-[11px] sm:text-xs"
            data-testid={testId}
        >
            <Icon className="h-3 w-3" />
            <span className="truncate">{children}</span>
            {count > 0 && (
                <span className="ml-1 px-1 py-0.5 text-[10px] rounded-full bg-primary/20 text-primary">
                    {count}
                </span>
            )}
        </TabsTrigger>
    );
}

function SidebarPanel(props: PipelineEditorSidebarProps) {
    switch (props.activePanel) {
        case PIPELINE_EDITOR_PANEL.STEPS:
            return <StepsSidebar {...props} />;
        case PIPELINE_EDITOR_PANEL.TRIGGERS:
            return (
                <TriggersPanel
                    triggers={props.combinedTriggers}
                    onChange={props.onTriggersChange}
                    readOnly={props.readOnly || !props.simpleLinearGraph}
                    variant="compact"
                />
            );
        case PIPELINE_EDITOR_PANEL.SETTINGS:
            return (
                <fieldset disabled={props.readOnly} className="contents">
                    <PipelineSettingsPanel
                        context={props.definition.context ?? {}}
                        onChange={props.onContextChange}
                        errors={props.pipelineContextErrors}
                    />
                </fieldset>
            );
        case PIPELINE_EDITOR_PANEL.HOOKS:
            return (
                <PipelineHooksView
                    groups={props.hookGroups}
                    hookCount={props.hookCount}
                    statusLabel={props.hookStatusLabel}
                    compact
                />
            );
    }
}

function StepsSidebar(props: PipelineEditorSidebarProps) {
    const steps = props.definition.steps ?? [];
    const structuralEditing = !props.readOnly && props.simpleLinearGraph;
    return (
        <>
            <div className="p-3 border-b bg-muted/50">
                <h3 className="font-semibold text-sm"><Trans>Pipeline steps</Trans></h3>
                <p className="text-xs text-muted-foreground">
                    {props.readOnly
                        ? <Trans>Read-only access</Trans>
                        : props.simpleLinearGraph
                            ? <Trans>Select a step to configure it</Trans>
                            : <Trans>Use Workflow mode to change this branched graph</Trans>}
                </p>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-1">
                {steps.map((step, index) => (
                    <StepListItemWrapper
                        key={step.key}
                        step={step}
                        index={index}
                        edges={props.definition.edges ?? []}
                        selectedStepIndex={props.selectedStepIndex}
                        issues={props.issues}
                        onStepClick={props.onStepClick}
                        onMoveUp={props.onMoveStepUp}
                        onMoveDown={props.onMoveStepDown}
                        onRemove={props.onRemoveStep}
                        canMoveUp={structuralEditing && canMoveSimpleStep(props.definition, index, index - 1)}
                        canMoveDown={structuralEditing && canMoveSimpleStep(props.definition, index, index + 1)}
                        canRemove={structuralEditing}
                    />
                ))}
                {steps.length === 0 && (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                        <Trans>No steps yet. Add a step to get started.</Trans>
                    </div>
                )}
            </div>
            <div className="p-3 border-t bg-muted/50">
                <p className="text-xs text-muted-foreground mb-2"><Trans>Add step:</Trans></p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1" data-testid="datahub-editor-add-step-buttons">
                    {ADDABLE_STEP_TYPES.map(type => (
                        <AddStepButton
                            key={type}
                            type={type}
                            onAddStep={props.onAddStep}
                            disabled={!structuralEditing}
                        />
                    ))}
                </div>
            </div>
        </>
    );
}

interface StepListItemWrapperProps {
    readonly step: PipelineStepDefinition;
    readonly index: number;
    readonly edges: Array<{ from: string; to: string }>;
    readonly selectedStepIndex: number | null;
    readonly issues: readonly ValidationIssue[];
    readonly onStepClick: (index: number) => void;
    readonly onMoveUp: (index: number) => void;
    readonly onMoveDown: (index: number) => void;
    readonly onRemove: (index: number) => void;
    readonly canMoveUp: boolean;
    readonly canMoveDown: boolean;
    readonly canRemove: boolean;
}

const StepListItemWrapper = memo(function StepListItemWrapper(props: StepListItemWrapperProps) {
    const {
        step,
        index,
        onStepClick,
        onMoveUp,
        onMoveDown,
        onRemove,
    } = props;
    const handleClick = useCallback(() => onStepClick(index), [index, onStepClick]);
    const handleMoveUp = useCallback(() => onMoveUp(index), [index, onMoveUp]);
    const handleMoveDown = useCallback(() => onMoveDown(index), [index, onMoveDown]);
    const handleRemove = useCallback(() => onRemove(index), [index, onRemove]);
    return (
        <StepListItem
            step={step}
            index={index}
            isSelected={props.selectedStepIndex === index}
            onClick={handleClick}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onRemove={handleRemove}
            canRemove={props.canRemove}
            isFirst={!props.canMoveUp}
            isLast={!props.canMoveDown}
            issueCount={props.issues.filter(issue => issue.stepKey === step.key).length}
            connectionCount={props.edges.filter(edge => edge.from === step.key || edge.to === step.key).length}
        />
    );
});

const AddStepButton = memo(function AddStepButton({
    type,
    onAddStep,
    disabled,
}: {
    readonly type: StepType;
    readonly onAddStep: (type: StepType) => void;
    readonly disabled: boolean;
}) {
    const { getStepConfig } = useStepConfigs();
    const config = getStepConfig(type);
    const Icon = getStepTypeIcon(type) ?? Play;
    const handleClick = useCallback(() => onAddStep(type), [onAddStep, type]);
    return (
        <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={handleClick}
            title={config?.description}
            disabled={disabled}
            data-testid={`datahub-editor-add-step-${type.toLowerCase()}`}
        >
            <Icon className="h-3 w-3 mr-1" />
            {config?.label ?? type}
        </Button>
    );
});
