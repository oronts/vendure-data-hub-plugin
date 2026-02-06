import * as React from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Badge } from '@vendure/dashboard';
import type { PipelineNodeData, VisualNodeCategory } from '../../../types';
import { getVisualNodeConfig, VisualNodeConfig } from './visual-node-config';
import { FALLBACK_COLORS, BRANCH_COLORS, NODE_DIMENSIONS, ICON_SIZES } from '../../../constants';
import { TEST_STATUS } from '../../../constants/ui-states';

export interface PipelineNodeProps extends NodeProps<Node<PipelineNodeData>> {
    category: VisualNodeCategory;
}

export function createPipelineNode(category: VisualNodeCategory) {
    return function PipelineNodeComponent({ data, selected }: NodeProps<Node<PipelineNodeData>>) {
        const config = getVisualNodeConfig(category);
        const Icon = config.icon;

        return (
            <div
                className={`${NODE_DIMENSIONS.MIN_WIDTH} rounded-lg border-2 bg-white shadow-md transition-all ${
                    selected ? 'shadow-lg' : ''
                }`}
                style={{ borderColor: selected ? config.color : FALLBACK_COLORS.BORDER }}
                data-testid={`datahub-pipeline-node-${category}`}
            >
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
                <div className="px-3 py-2 text-xs text-muted-foreground">{config.description}</div>
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

export function ConditionNodeComponent({ data, selected }: NodeProps<Node<PipelineNodeData>>) {
    const config = getVisualNodeConfig('condition');
    const Icon = config.icon;

    return (
        <div
            className={`${NODE_DIMENSIONS.MIN_WIDTH} rounded-lg border-2 bg-white shadow-md transition-all ${
                selected ? 'shadow-lg' : ''
            }`}
            style={{ borderColor: selected ? config.color : FALLBACK_COLORS.BORDER }}
            data-testid="datahub-pipeline-node-condition"
        >
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
            <div className="px-3 py-2 text-xs text-muted-foreground">{config.description}</div>
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

function StatusBadge({ status }: { status: PipelineNodeData['status'] }) {
    if (!status) return null;

    switch (status) {
        case TEST_STATUS.TESTING:
            return (
                <div className="px-3 pb-2" role="status" aria-live="polite">
                    <Badge variant="secondary" className="animate-pulse">Running...</Badge>
                </div>
            );
        case TEST_STATUS.SUCCESS:
            return (
                <div className="px-3 pb-2" role="status" aria-live="polite">
                    <Badge className="bg-green-500">Complete</Badge>
                </div>
            );
        case TEST_STATUS.ERROR:
            return (
                <div className="px-3 pb-2" role="status" aria-live="assertive">
                    <Badge variant="destructive">Error</Badge>
                </div>
            );
        case TEST_STATUS.WARNING:
            return (
                <div className="px-3 pb-2" role="status" aria-live="polite">
                    <Badge variant="outline" className="border-amber-500 text-amber-500">Warning</Badge>
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
};
