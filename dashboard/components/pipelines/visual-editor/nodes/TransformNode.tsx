/**
 * TransformNode Component
 * Node component for data transformation types
 */

import * as React from 'react';
import { NodeProps, Node } from '@xyflow/react';
import type { PipelineNodeData } from '../types/index';
import { BaseNode } from './BaseNode';
import { NODE_TYPE_COLORS } from '../constants/index';

export function TransformNode(props: NodeProps<Node<PipelineNodeData>>) {
    return <BaseNode {...props} nodeType="transform" defaultColor={NODE_TYPE_COLORS.transform} />;
}

export default TransformNode;
