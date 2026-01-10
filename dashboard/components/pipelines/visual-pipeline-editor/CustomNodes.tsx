import * as React from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Badge } from '@vendure/dashboard';
import { RefreshCw, CheckCircle, AlertCircle, GitBranch, Box } from 'lucide-react';
import { getAdapterInfo } from './helpers';
import type { PipelineNodeData } from './types';

// BASE NODE COMPONENT

interface BaseNodeProps extends NodeProps<Node<PipelineNodeData>> {
    nodeType: string;
    defaultColor: string;
}

function BaseNode({ data, selected, nodeType, defaultColor }: BaseNodeProps) {
    const adapter = getAdapterInfo(data.adapterCode);
    const Icon = adapter?.icon || Box;
    const color = adapter?.color || defaultColor;

    const showLeftHandle = nodeType !== 'source';
    const showRightHandle = nodeType !== 'load' && nodeType !== 'feed' && nodeType !== 'export';

    return (
        <div
            className={`min-w-[200px] rounded-lg border-2 bg-white shadow-md transition-all ${
                selected ? 'border-primary shadow-lg ring-2 ring-primary/20' : 'border-gray-200 hover:shadow-lg'
            }`}
        >
            {showLeftHandle && (
                <Handle type="target" position={Position.Left} className="!bg-gray-400 !w-3 !h-3 !border-2 !border-white" />
            )}
            <div
                className="px-3 py-2 rounded-t-lg text-white flex items-center gap-2"
                style={{ backgroundColor: color }}
            >
                <Icon className="w-4 h-4" />
                <span className="font-medium text-sm truncate flex-1">{data.label}</span>
                {data.status === 'running' && (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                )}
                {data.status === 'success' && (
                    <CheckCircle className="w-3 h-3" />
                )}
                {data.status === 'error' && (
                    <AlertCircle className="w-3 h-3" />
                )}
            </div>
            <div className="px-3 py-2">
                <div className="text-xs text-gray-500">{adapter?.description || nodeType}</div>
                {data.recordCount !== undefined && (
                    <div className="mt-1 flex items-center gap-2 text-xs">
                        <Badge variant="secondary" className="h-5">
                            {data.recordCount.toLocaleString()} records
                        </Badge>
                        {data.errorCount !== undefined && data.errorCount > 0 && (
                            <Badge variant="destructive" className="h-5">
                                {data.errorCount} errors
                            </Badge>
                        )}
                    </div>
                )}
            </div>
            {showRightHandle && (
                <Handle type="source" position={Position.Right} className="!w-3 !h-3 !border-2 !border-white" style={{ backgroundColor: color }} />
            )}
        </div>
    );
}

// SPECIALIZED NODE COMPONENTS

export function SourceNode(props: NodeProps<Node<PipelineNodeData>>) {
    return <BaseNode {...props} nodeType="source" defaultColor="#3b82f6" />;
}

export function TransformNode(props: NodeProps<Node<PipelineNodeData>>) {
    return <BaseNode {...props} nodeType="transform" defaultColor="#8b5cf6" />;
}

export function ValidateNode(props: NodeProps<Node<PipelineNodeData>>) {
    return <BaseNode {...props} nodeType="validate" defaultColor="#22c55e" />;
}

export function ConditionNode({ data, selected }: NodeProps<Node<PipelineNodeData>>) {
    return (
        <div
            className={`min-w-[200px] rounded-lg border-2 bg-white shadow-md transition-all ${
                selected ? 'border-orange-500 shadow-lg ring-2 ring-orange-500/20' : 'border-gray-200'
            }`}
        >
            <Handle type="target" position={Position.Left} className="!bg-orange-500 !w-3 !h-3 !border-2 !border-white" />
            <div className="px-3 py-2 rounded-t-lg text-white flex items-center gap-2 bg-orange-500">
                <GitBranch className="w-4 h-4" />
                <span className="font-medium text-sm truncate">{data.label}</span>
            </div>
            <div className="px-3 py-2 text-xs text-gray-500">
                Route based on condition
            </div>
            <Handle
                type="source"
                position={Position.Right}
                id="true"
                className="!bg-green-500 !w-3 !h-3 !border-2 !border-white"
                style={{ top: '35%' }}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="false"
                className="!bg-red-500 !w-3 !h-3 !border-2 !border-white"
                style={{ top: '65%' }}
            />
            <div className="absolute right-[-60px] top-[25%] text-xs text-green-600 font-medium">True</div>
            <div className="absolute right-[-60px] top-[55%] text-xs text-red-600 font-medium">False</div>
        </div>
    );
}

export function LoadNode(props: NodeProps<Node<PipelineNodeData>>) {
    return <BaseNode {...props} nodeType="load" defaultColor="#6366f1" />;
}

export function FeedNode(props: NodeProps<Node<PipelineNodeData>>) {
    return <BaseNode {...props} nodeType="feed" defaultColor="#f97316" />;
}

export function ExportNode(props: NodeProps<Node<PipelineNodeData>>) {
    return <BaseNode {...props} nodeType="export" defaultColor="#0ea5e9" />;
}

// NODE TYPES MAP

export const nodeTypes = {
    source: SourceNode,
    transform: TransformNode,
    validate: ValidateNode,
    condition: ConditionNode,
    filter: TransformNode,
    load: LoadNode,
    feed: FeedNode,
    export: ExportNode,
};
