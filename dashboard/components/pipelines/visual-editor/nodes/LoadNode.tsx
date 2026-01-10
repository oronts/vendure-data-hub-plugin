/**
 * LoadNode Component
 * Node component for data loading/destination types
 */

import * as React from 'react';
import { NodeProps, Node } from '@xyflow/react';
import type { PipelineNodeData } from '../types/index';
import { BaseNode } from './BaseNode';
import { NODE_TYPE_COLORS } from '../constants/index';

export function LoadNode(props: NodeProps<Node<PipelineNodeData>>) {
    return <BaseNode {...props} nodeType="load" defaultColor={NODE_TYPE_COLORS.load} />;
}

export default LoadNode;
