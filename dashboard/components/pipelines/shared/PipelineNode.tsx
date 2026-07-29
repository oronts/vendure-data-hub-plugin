import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Badge } from '@vendure/dashboard';
import type { PipelineNodeData, VisualNodeCategory } from '../../../types';
import { getVisualNodeConfig, resolveVisualNodeText } from './visual-node-config';
import { FALLBACK_COLORS, BRANCH_COLORS, NODE_DIMENSIONS, ICON_SIZES, TEST_STATUS } from '../../../constants';

function useVisualNodeText(category: VisualNodeCategory) {
    const { t } = useLingui();
    const config = getVisualNodeConfig(category);
    const fallback = (() => {
        switch (category) {
            case 'trigger':
                return { label: t`Trigger`, description: t`Pipeline trigger` };
            case 'source':
                return { label: t`Source`, description: t`Data source` };
            case 'transform':
                return { label: t`Transform`, description: t`Transform data` };
            case 'validate':
                return { label: t`Validate`, description: t`Validate data` };
            case 'enrich':
                return { label: t`Enrich`, description: t`Enrich with additional data` };
            case 'condition':
                return { label: t`Condition`, description: t`Route based on condition` };
            case 'load':
                return { label: t`Load`, description: t`Load to destination` };
            case 'export':
                return { label: t`Export`, description: t`Export to external system` };
            case 'feed':
                return { label: t`Feed`, description: t`Generate product feed` };
            case 'sink':
                return { label: t`Sink`, description: t`Index to search engine` };
            case 'filter':
                return { label: t`Filter`, description: t`Filter data` };
            case 'gate':
                return { label: t`Gate`, description: t`Pause for human approval` };
        }
    })();

    return { config, text: resolveVisualNodeText(config, fallback) };
}

export function createPipelineNode(category: VisualNodeCategory) {
    return function PipelineNodeComponent({ data, selected }: NodeProps<Node<PipelineNodeData>>) {
        const { config, text } = useVisualNodeText(category);
        const Icon = config.icon;

        return (
            <div
                className={`${NODE_DIMENSIONS.MIN_WIDTH} relative rounded-lg border-2 bg-background shadow-md transition-all ${
                    selected ? 'shadow-lg' : ''
                }`}
                style={{ borderColor: selected ? config.color : FALLBACK_COLORS.BORDER }}
                data-testid={`datahub-pipeline-node-${category}`}
            >
                <ValidationIssueBadge count={data.validationIssueCount} />
                {config.hasTargetHandle && (
                    <Handle
                        type="target"
                        position={Position.Left}
                        style={{ backgroundColor: config.color }}
                        className={NODE_DIMENSIONS.HANDLE_SIZE}
                    />
                )}
                <div
                    className="px-3 py-2 rounded-t-lg text-white flex items-center gap-2"
                    style={{ backgroundColor: config.color }}
                >
                    <Icon className={ICON_SIZES.SM} />
                    <span className="font-medium text-sm truncate">{data.label}</span>
                </div>
                <div className="px-3 py-2 text-xs text-muted-foreground">{text.description}</div>
                {data.status && <StatusBadge status={data.status} />}
                {config.hasSourceHandle && (
                    <Handle
                        type="source"
                        position={Position.Right}
                        style={{ backgroundColor: config.color }}
                        className={NODE_DIMENSIONS.HANDLE_SIZE}
                    />
                )}
            </div>
        );
    };
}

function ConditionNodeComponent({ data, selected }: NodeProps<Node<PipelineNodeData>>) {
    const { config, text } = useVisualNodeText('condition');
    const Icon = config.icon;

    return (
        <div
            className={`${NODE_DIMENSIONS.MIN_WIDTH} relative rounded-lg border-2 bg-background shadow-md transition-all ${
                selected ? 'shadow-lg' : ''
            }`}
            style={{ borderColor: selected ? config.color : FALLBACK_COLORS.BORDER }}
            data-testid="datahub-pipeline-node-condition"
        >
            <ValidationIssueBadge count={data.validationIssueCount} />
            <Handle
                type="target"
                position={Position.Left}
                style={{ backgroundColor: config.color }}
                className={NODE_DIMENSIONS.HANDLE_SIZE}
            />
            <div
                className="px-3 py-2 rounded-t-lg text-white flex items-center gap-2"
                style={{ backgroundColor: config.color }}
            >
                <Icon className={ICON_SIZES.SM} />
                <span className="font-medium text-sm truncate">{data.label}</span>
            </div>
            <div className="px-3 py-2 text-xs text-muted-foreground">{text.description}</div>
            <Handle
                type="source"
                position={Position.Right}
                id="true"
                className={NODE_DIMENSIONS.HANDLE_SIZE}
                style={{ top: '40%', backgroundColor: BRANCH_COLORS.TRUE }}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="false"
                className={NODE_DIMENSIONS.HANDLE_SIZE}
                style={{ top: '60%', backgroundColor: BRANCH_COLORS.FALSE }}
            />
        </div>
    );
}

function ValidationIssueBadge({ count }: { readonly count?: number }) {
    const { t } = useLingui();
    if (!count) return null;
    return (
        <Badge
            variant="outline"
            className="absolute -right-2 -top-2 z-10 border-amber-500 bg-background text-amber-700 dark:text-amber-300"
            aria-label={t`${count} validation issues`}
        >
            {count}
        </Badge>
    );
}

function StatusBadge({ status }: { status: PipelineNodeData['status'] }) {
    if (!status) return null;

    switch (status) {
        case TEST_STATUS.TESTING:
            return (
                <div className="px-3 pb-2" role="status" aria-live="polite">
                    <Badge variant="secondary" className="animate-pulse">
                        <Trans>Running...</Trans>
                    </Badge>
                </div>
            );
        case TEST_STATUS.SUCCESS:
            return (
                <div className="px-3 pb-2" role="status" aria-live="polite">
                    <Badge className="bg-green-500"><Trans>Complete</Trans></Badge>
                </div>
            );
        case TEST_STATUS.ERROR:
            return (
                <div className="px-3 pb-2" role="status" aria-live="assertive">
                    <Badge variant="destructive"><Trans>Error</Trans></Badge>
                </div>
            );
        case TEST_STATUS.WARNING:
            return (
                <div className="px-3 pb-2" role="status" aria-live="polite">
                    <Badge variant="outline" className="border-amber-500 dark:border-amber-400 text-amber-500 dark:text-amber-400">
                        <Trans>Warning</Trans>
                    </Badge>
                </div>
            );
        default:
            return null;
    }
}

export const TriggerNode = createPipelineNode('trigger');
export const SourceNode = createPipelineNode('source');
export const TransformNode = createPipelineNode('transform');
export const ValidateNode = createPipelineNode('validate');
export const EnrichNode = createPipelineNode('enrich');
export const LoadNode = createPipelineNode('load');
export const FeedNode = createPipelineNode('feed');
export const ExportNode = createPipelineNode('export');
export const SinkNode = createPipelineNode('sink');
export const FilterNode = createPipelineNode('filter');
export const GateNode = createPipelineNode('gate');

export const ConditionNode = ConditionNodeComponent;

export const pipelineNodeTypes = {
    trigger: TriggerNode,
    source: SourceNode,
    transform: TransformNode,
    validate: ValidateNode,
    condition: ConditionNode,
    filter: FilterNode,
    load: LoadNode,
    feed: FeedNode,
    export: ExportNode,
    sink: SinkNode,
    enrich: EnrichNode,
    gate: GateNode,
};
