/**
 * ConditionNode Component
 * Node component for conditional routing with multiple outputs
 */

import * as React from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { GitBranch } from 'lucide-react';
import type { PipelineNodeData } from '../types/index';

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

export default ConditionNode;
