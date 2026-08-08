import { Trans, useLingui } from '@lingui/react/macro';
import { AlertTriangle, Zap } from 'lucide-react';

import { StepConfigPanel } from '../shared/step-config';
import type { StepConfigData } from '../shared/step-config';
import { PIPELINE_EDITOR_PANEL } from '../../constants';
import type { PipelineEditorPanel } from '../../constants';
import type { AdapterMetadata, TriggerTypeConfig } from '../../hooks';
import type { PipelineStepDefinition } from '../../types';
import type { ConfiguredHookStageGroup } from './pipeline-editor-view-model';
import { PipelineHooksView } from './PipelineHooksView';

const FALLBACK_TRIGGER_TYPES = [
    'MANUAL',
    'SCHEDULE',
    'WEBHOOK',
    'EVENT',
    'FILE_WATCH',
] as const;

interface PipelineEditorDetailsProps {
    readonly activePanel: PipelineEditorPanel;
    readonly selectedStep: PipelineStepDefinition | null | undefined;
    readonly readOnly: boolean;
    readonly adapters: AdapterMetadata[];
    readonly catalogLoading: boolean;
    readonly catalogError: Error | null;
    readonly selectedStepErrors: Record<string, string>;
    readonly triggerTypes: TriggerTypeConfig[];
    readonly triggerTypesLoading: boolean;
    readonly hookGroups: readonly ConfiguredHookStageGroup[];
    readonly hookCount: number;
    readonly onStepChange: (data: StepConfigData) => void;
}

export function PipelineEditorDetails(props: PipelineEditorDetailsProps) {
    switch (props.activePanel) {
        case PIPELINE_EDITOR_PANEL.STEPS:
            return <StepDetails {...props} />;
        case PIPELINE_EDITOR_PANEL.TRIGGERS:
            return <TriggerDetails {...props} />;
        case PIPELINE_EDITOR_PANEL.SETTINGS:
            return <SettingsDetails />;
        case PIPELINE_EDITOR_PANEL.HOOKS:
            return <PipelineHooksView groups={props.hookGroups} hookCount={props.hookCount} />;
    }
}

function StepDetails({
    selectedStep,
    readOnly,
    adapters,
    catalogLoading,
    catalogError,
    selectedStepErrors,
    onStepChange,
}: PipelineEditorDetailsProps) {
    if (!selectedStep) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                    <p className="text-sm"><Trans>Select a step to configure</Trans></p>
                    <p className="text-xs mt-1"><Trans>or add a new step from the left panel</Trans></p>
                </div>
            </div>
        );
    }
    return (
        <div className="p-4">
            <fieldset disabled={readOnly} className="contents">
                <StepConfigPanel
                    data={{
                        key: selectedStep.key,
                        type: selectedStep.type,
                        config: selectedStep.config ?? {},
                        adapterCode: selectedStep.adapterCode
                            ?? selectedStep.config?.adapterCode as string | undefined,
                        context: selectedStep.context,
                        schemaRef: selectedStep.schemaRef,
                    }}
                    onChange={onStepChange}
                    catalog={adapters}
                    catalogLoading={catalogLoading}
                    catalogError={catalogError}
                    errors={selectedStepErrors}
                    variant="inline"
                    showDeleteButton={false}
                />
            </fieldset>
        </div>
    );
}

function TriggerDetails({ triggerTypes, triggerTypesLoading }: PipelineEditorDetailsProps) {
    const { t } = useLingui();
    const fallbackText = (type: (typeof FALLBACK_TRIGGER_TYPES)[number]) => {
        switch (type) {
            case 'MANUAL': return { label: t`Manual`, description: t`Run from the dashboard or API` };
            case 'SCHEDULE': return { label: t`Schedule`, description: t`Run on a cron schedule` };
            case 'WEBHOOK': return { label: t`Webhook`, description: t`Run when a webhook is called` };
            case 'EVENT': return { label: t`Event`, description: t`Run when a Vendure event fires` };
            case 'FILE_WATCH': return { label: t`File watch`, description: t`Run when files appear` };
        }
    };
    const details = triggerTypesLoading || triggerTypes.length === 0
        ? FALLBACK_TRIGGER_TYPES.map(type => ({ type, ...fallbackText(type) }))
        : triggerTypes;
    return (
        <div className="p-6">
            <h3 className="font-semibold mb-4"><Trans>Trigger configuration</Trans></h3>
            <p className="text-sm text-muted-foreground">
                <Trans>Configure how and when this pipeline runs. You can use multiple triggers, for example, a scheduled run and manual triggering.</Trans>
            </p>
            <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                <h4 className="text-sm font-medium mb-2"><Trans>Trigger types:</Trans></h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                    {details.map(trigger => (
                        <li key={trigger.type}>
                            <strong>{trigger.label}</strong> - {trigger.description}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function SettingsDetails() {
    return (
        <div className="p-6">
            <h3 className="font-semibold mb-4"><Trans>Pipeline settings</Trans></h3>
            <p className="text-sm text-muted-foreground">
                <Trans>Configure execution behavior, including error handling, throughput controls, and parallel step execution.</Trans>
            </p>
            <div className="mt-4 space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <Trans>Error handling</Trans>
                    </h4>
                    <p className="text-xs text-muted-foreground">
                        <Trans>Configure retry limits and exponential backoff for HTTP loaders.</Trans>
                    </p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Zap className="h-4 w-4 text-green-500" />
                        <Trans>Throughput</Trans>
                    </h4>
                    <p className="text-xs text-muted-foreground">
                        <Trans>Control batch size, concurrency, and rate limiting.</Trans>
                    </p>
                </div>
            </div>
        </div>
    );
}
