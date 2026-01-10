/**
 * FeedNode Component
 * Node component for feed export types
 */

import * as React from 'react';
import { NodeProps, Node } from '@xyflow/react';
import type { PipelineNodeData } from '../types/index';
import { BaseNode } from './BaseNode';
import { NODE_TYPE_COLORS } from '../constants/index';

export function FeedNode(props: NodeProps<Node<PipelineNodeData>>) {
    return <BaseNode {...props} nodeType="feed" defaultColor={NODE_TYPE_COLORS.feed} />;
}

export default FeedNode;
