/**
 * ValidateNode Component
 * Node component for data validation types
 */

import * as React from 'react';
import { NodeProps, Node } from '@xyflow/react';
import type { PipelineNodeData } from '../types/index';
import { BaseNode } from './BaseNode';
import { NODE_TYPE_COLORS } from '../constants/index';

export function ValidateNode(props: NodeProps<Node<PipelineNodeData>>) {
    return <BaseNode {...props} nodeType="validate" defaultColor={NODE_TYPE_COLORS.validate} />;
}

export default ValidateNode;
