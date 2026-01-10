/**
 * VisualPipelineEditor Component
 * Main visual pipeline editor with drag-and-drop node canvas
 */

import * as React from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    addEdge,
    useNodesState,
    useEdgesState,
    MarkerType,
    Connection,
    Edge,
    Node,
    Panel,
    useReactFlow,
    ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Badge } from '@vendure/dashboard';
import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { Play, Save, Zap, Layers } from 'lucide-react';

import type {
    VisualPipelineEditorProps,
    PipelineNodeData,
    TriggerConfig,
    VendureEntitySchema,
} from './types';
import { vendureSchemasQuery } from './queries';
import { getAdapterInfo, DEFAULT_EDGE_STYLE } from './constants';
import { nodeTypes } from './nodes';
import { NodePalette } from './panels/NodePalette';
import { TriggerPanel } from './panels/TriggerPanel';
import { NodePropertiesPanel } from '../shared/NodePropertiesPanel';

function VisualPipelineEditorInner({
    definition,
    onChange,
    onRun,
    onSave,
    readOnly = false,
}: VisualPipelineEditorProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState(definition.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(definition.edges);
    const [selectedNode, setSelectedNode] = React.useState<Node<PipelineNodeData> | null>(null);
    const [triggers, setTriggers] = React.useState<TriggerConfig[]>(definition.triggers || []);
    const [showTriggers, setShowTriggers] = React.useState(false);
    const reactFlowWrapper = React.useRef<HTMLDivElement>(null);
    const { screenToFlowPosition } = useReactFlow();

    // Fetch Vendure schemas for field mapping
    const { data: schemasData } = useQuery({
        queryKey: ['vendure-schemas-editor'],
        queryFn: () => api.query(vendureSchemasQuery, {}),
    });
    const vendureSchemas = schemasData?.dataHubVendureSchemas || [];

    // Sync changes back to parent
    React.useEffect(() => {
        onChange({ ...definition, nodes, edges, triggers });
    }, [nodes, edges, triggers]);

    // Handle new connections
    const onConnect = React.useCallback((connection: Connection) => {
        const newEdge: Edge = {
            ...connection,
            id: `edge-${Date.now()}`,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: DEFAULT_EDGE_STYLE,
            animated: false,
        } as Edge;
        setEdges(eds => addEdge(newEdge, eds));
    }, [setEdges]);

    // Handle node selection
    const onNodeClick = React.useCallback((_: any, node: Node) => {
        setSelectedNode(node as Node<PipelineNodeData>);
    }, []);

    // Handle pane click (deselect)
    const onPaneClick = React.useCallback(() => {
        setSelectedNode(null);
    }, []);

    // Handle drag from palette
    const onDragStart = (event: React.DragEvent, nodeType: string, category: string, label: string) => {
        event.dataTransfer.setData('application/reactflow', JSON.stringify({ nodeType, category, label }));
        event.dataTransfer.effectAllowed = 'move';
    };

    const onDragOver = React.useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = React.useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const data = event.dataTransfer.getData('application/reactflow');
            if (!data) return;

            const { nodeType, category, label } = JSON.parse(data);

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const newNode: Node<PipelineNodeData> = {
                id: `node-${Date.now()}`,
                type: category,
                position,
                data: {
                    label,
                    type: category,
                    adapterCode: nodeType,
                    config: {},
                },
            };

            setNodes(nds => [...nds, newNode]);
        },
        [screenToFlowPosition, setNodes],
    );

    // Update node
    const updateNode = React.useCallback((updatedNode: Node<PipelineNodeData>) => {
        setNodes(nds => nds.map(n => n.id === updatedNode.id ? updatedNode : n));
        setSelectedNode(updatedNode);
    }, [setNodes]);

    // Delete node
    const deleteSelectedNode = React.useCallback(() => {
        if (!selectedNode) return;
        setNodes(nds => nds.filter(n => n.id !== selectedNode.id));
        setEdges(eds => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id));
        setSelectedNode(null);
    }, [selectedNode, setNodes, setEdges]);

    return (
        <div className="flex h-full gap-4">
            {/* Node Palette */}
            {!readOnly && (
                <NodePalette onDragStart={onDragStart} />
            )}

            {/* ReactFlow Canvas */}
            <div className="flex-1 flex flex-col">
                {/* Toolbar */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline">{nodes.length} nodes</Badge>
                        <Badge variant="outline">{edges.length} connections</Badge>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowTriggers(!showTriggers)}
                            className={showTriggers ? 'bg-muted' : ''}
                        >
                            <Zap className="w-4 h-4 mr-1" />
                            Triggers ({triggers.length})
                        </Button>
                    </div>
                    <div className="flex items-center gap-2">
                        {onRun && (
                            <Button onClick={onRun} className="gap-2">
                                <Play className="w-4 h-4" />
                                Run Pipeline
                            </Button>
                        )}
                        {onSave && (
                            <Button variant="outline" onClick={onSave} className="gap-2">
                                <Save className="w-4 h-4" />
                                Save
                            </Button>
                        )}
                    </div>
                </div>

                {/* Triggers Panel */}
                {showTriggers && (
                    <div className="mb-3">
                        <TriggerPanel triggers={triggers} onChange={setTriggers} />
                    </div>
                )}

                {/* Canvas */}
                <div className="flex-1 border rounded-lg overflow-hidden" ref={reactFlowWrapper}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={readOnly ? undefined : onNodesChange}
                        onEdgesChange={readOnly ? undefined : onEdgesChange}
                        onConnect={readOnly ? undefined : onConnect}
                        onNodeClick={onNodeClick}
                        onPaneClick={onPaneClick}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        nodeTypes={nodeTypes}
                        defaultEdgeOptions={{
                            markerEnd: { type: MarkerType.ArrowClosed },
                            style: DEFAULT_EDGE_STYLE,
                        }}
                        fitView
                        className="bg-gray-50"
                        deleteKeyCode={['Backspace', 'Delete']}
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background color="#e5e7eb" gap={16} />
                        <Controls />
                        <MiniMap
                            nodeStrokeWidth={3}
                            zoomable
                            pannable
                            nodeColor={node => {
                                const adapter = getAdapterInfo(node.data?.adapterCode);
                                return adapter?.color || '#6b7280';
                            }}
                        />
                        {nodes.length === 0 && (
                            <Panel position="top-center" className="mt-24">
                                <div className="text-center text-muted-foreground bg-white/90 p-8 rounded-xl shadow-lg">
                                    <Layers className="w-16 h-16 mx-auto mb-4 opacity-40" />
                                    <p className="text-xl font-medium mb-2">Build Your Pipeline</p>
                                    <p className="text-sm max-w-md">
                                        Drag nodes from the palette on the left and connect them to create your data flow.
                                        Start with a source, add transforms, and end with a destination.
                                    </p>
                                </div>
                            </Panel>
                        )}
                    </ReactFlow>
                </div>
            </div>

            {/* Properties Panel */}
            <NodePropertiesPanel
                node={selectedNode}
                vendureSchemas={vendureSchemas as VendureEntitySchema[]}
                onUpdate={updateNode}
                onDelete={deleteSelectedNode}
                onClose={() => setSelectedNode(null)}
            />
        </div>
    );
}

// Wrap with ReactFlowProvider
export function VisualPipelineEditor(props: VisualPipelineEditorProps) {
    return (
        <ReactFlowProvider>
            <VisualPipelineEditorInner {...props} />
        </ReactFlowProvider>
    );
}

export default VisualPipelineEditor;
