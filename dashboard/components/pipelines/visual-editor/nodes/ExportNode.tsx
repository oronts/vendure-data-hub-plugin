/**
 * ExportNode Component
 * Node component for file export types
 */

import * as React from 'react';
import { NodeProps, Node } from '@xyflow/react';
import type { PipelineNodeData } from '../types/index';
import { BaseNode } from './BaseNode';
import { NODE_TYPE_COLORS } from '../constants/index';

export function ExportNode(props: NodeProps<Node<PipelineNodeData>>) {
    return <BaseNode {...props} nodeType="export" defaultColor={NODE_TYPE_COLORS.export} />;
}

export default ExportNode;
