/**
 * BaseNode Component
 * Base component for all pipeline node types
 */

import * as React from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Badge } from '@vendure/dashboard';
import { RefreshCw, CheckCircle, AlertCircle, Box } from 'lucide-react';
import type { PipelineNodeData } from '../types/index';
import { getAdapterInfo } from '../constants/index';

interface BaseNodeProps extends NodeProps<Node<PipelineNodeData>> {
    nodeType: string;
    defaultColor: string;
}

export function BaseNode({ data, selected, nodeType, defaultColor }: BaseNodeProps) {
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

export default BaseNode;
