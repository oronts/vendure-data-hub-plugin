import type { Node } from '@xyflow/react';
import type { PipelineNodeData } from '../../types';

export function reconcileSelectedNode(
    selectedNode: Node<PipelineNodeData> | null,
    nodes: Node<PipelineNodeData>[],
): Node<PipelineNodeData> | null {
    if (!selectedNode) {
        return null;
    }
    return nodes.find(node => node.id === selectedNode.id) ?? null;
}
