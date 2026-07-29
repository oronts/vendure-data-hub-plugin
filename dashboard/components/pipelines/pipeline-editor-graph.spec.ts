import { MarkerType, type Connection, type Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { EDGE_STYLE } from '../../constants';
import type { PipelineNodeData, ValidationIssue } from '../../types';
import {
    collectNodeIssueCounts,
    collectPipelineContextErrors,
    createPipelineEdge,
    createPipelineNode,
    decorateNodesWithIssueCounts,
    getVisualDefinitionKey,
    preserveNodePositions,
} from './pipeline-editor-graph';

function node(
    id: string,
    x: number,
    label = id,
): Node<PipelineNodeData> {
    return {
        id,
        type: 'transform',
        position: { x, y: x },
        data: { label, type: 'transform', config: {} },
    };
}

describe('pipeline editor graph helpers', () => {
    it('creates the same typed node contract for keyboard and drop insertion', () => {
        expect(createPipelineNode({
            id: 'node-1',
            adapterCode: 'trim',
            category: 'transform',
            label: 'Trim',
            position: { x: 12, y: 34 },
        })).toEqual({
            id: 'node-1',
            type: 'transform',
            position: { x: 12, y: 34 },
            data: {
                label: 'Trim',
                type: 'transform',
                adapterCode: 'trim',
                config: {},
            },
        });
    });

    it('creates arrow edges with the configured visual weight', () => {
        const connection: Connection = {
            source: 'source',
            target: 'target',
            sourceHandle: null,
            targetHandle: 'input',
        };

        expect(createPipelineEdge(connection, 'edge-1')).toEqual({
            ...connection,
            id: 'edge-1',
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { strokeWidth: EDGE_STYLE.STROKE_WIDTH },
        });
    });

    it('uses structural content rather than positions for synchronization', () => {
        const first = node('a', 10, 'First');
        const moved = { ...first, position: { x: 900, y: 500 } };
        const definition = { nodes: [first], edges: [] };

        expect(getVisualDefinitionKey(definition)).toBe(
            getVisualDefinitionKey({ nodes: [moved], edges: [] }),
        );
        expect(getVisualDefinitionKey({ nodes: [node('a', 10, 'Changed')], edges: [] }))
            .not.toBe(getVisualDefinitionKey(definition));
        expect(getVisualDefinitionKey(null)).toBe('');
    });

    it('normalizes node and edge order in synchronization keys', () => {
        const edgeOne = { id: 'one', source: 'a', target: 'b' };
        const edgeTwo = { id: 'two', source: 'b', target: 'c' };
        const forward = {
            nodes: [node('a', 0), node('b', 10)],
            edges: [edgeOne, edgeTwo],
        };
        const reverse = {
            nodes: [...forward.nodes].reverse(),
            edges: [...forward.edges].reverse(),
        };

        expect(getVisualDefinitionKey(forward)).toBe(getVisualDefinitionKey(reverse));
    });

    it('preserves live canvas positions while accepting incoming node data', () => {
        const incoming = [node('retained', 10, 'Updated'), node('new', 20)];
        const current = [node('retained', 800, 'Stale')];

        expect(preserveNodePositions(incoming, current)).toEqual([
            { ...incoming[0], position: { x: 800, y: 800 } },
            incoming[1],
        ]);
    });

    it('separates pipeline context errors from per-node issue counts', () => {
        const issues: ValidationIssue[] = [
            { field: 'channel', message: 'Required' },
            { stepKey: 'source', field: 'url', message: 'Invalid' },
            { stepKey: 'source', message: 'Unavailable' },
            { stepKey: 'load', message: 'Missing' },
        ];

        expect(collectPipelineContextErrors(issues)).toEqual({ channel: 'Required' });
        expect(collectNodeIssueCounts(issues)).toEqual(new Map([
            ['source', 2],
            ['load', 1],
        ]));
    });

    it('decorates copies without mutating source node data', () => {
        const source = node('source', 0);
        const decorated = decorateNodesWithIssueCounts(
            [source],
            new Map([['source', 3]]),
        );

        expect(decorated[0].data.validationIssueCount).toBe(3);
        expect(source.data.validationIssueCount).toBeUndefined();
    });
});
