import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import type { PipelineNodeData } from '../../types';
import { reconcileSelectedNode } from './node-selection';

function createNode(id: string, label: string): Node<PipelineNodeData> {
    return {
        id,
        type: 'transform',
        position: { x: 0, y: 0 },
        data: {
            label,
            type: 'transform',
            config: {},
        },
    };
}

describe('reconcileSelectedNode', () => {
    it('clears a selection removed by an external definition change', () => {
        expect(reconcileSelectedNode(createNode('removed', 'Old'), [])).toBeNull();
    });

    it('uses the current node data for a retained selection', () => {
        const updatedNode = createNode('retained', 'Updated');
        expect(reconcileSelectedNode(
            createNode('retained', 'Stale'),
            [updatedNode],
        )).toBe(updatedNode);
    });

    it('keeps an empty selection empty', () => {
        expect(reconcileSelectedNode(null, [createNode('node', 'Node')])).toBeNull();
    });
});
