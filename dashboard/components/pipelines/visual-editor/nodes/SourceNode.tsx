/**
 * SourceNode Component
 * Node component for data source types
 */

import * as React from 'react';
import { NodeProps, Node } from '@xyflow/react';
import type { PipelineNodeData } from '../types/index';
import { BaseNode } from './BaseNode';
import { NODE_TYPE_COLORS } from '../constants/index';

export function SourceNode(props: NodeProps<Node<PipelineNodeData>>) {
    return <BaseNode {...props} nodeType="source" defaultColor={NODE_TYPE_COLORS.source} />;
}

export default SourceNode;
