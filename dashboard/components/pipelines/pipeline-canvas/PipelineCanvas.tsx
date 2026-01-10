import * as React from 'react';
import { Button, Card, Badge } from '@vendure/dashboard';
import { Play, Save, Layers } from 'lucide-react';
import { PipelineNodeComponent } from './PipelineNodeComponent';
import { NodePropertiesPanel } from './NodePropertiesPanel';
import { NodePalette } from './NodePalette';
import { getCategoryNodeType } from './helpers';
import type { PipelineCanvasProps, PipelineNode } from './types';

export function PipelineCanvas({
    definition,
    schemas,
    connections,
    onChange,
    onRun,
    onSave,
    readOnly = false,
}: PipelineCanvasProps) {
    const [selectedNode, setSelectedNode] = React.useState<PipelineNode | null>(null);
    const [draggedNode, setDraggedNode] = React.useState<string | null>(null);
    const canvasRef = React.useRef<HTMLDivElement>(null);

    const handleAddNode = (type: string, category: string) => {
        const nodeCategory = getCategoryNodeType(category);

        const newNode: PipelineNode = {
            id: `node-${Date.now()}`,
            type: nodeCategory as PipelineNode['type'],
            name: `New ${type}`,
            config: { adapterCode: type },
            position: { x: 300 + Math.random() * 100, y: 100 + Math.random() * 100 },
            inputs: nodeCategory !== 'source' ? ['in'] : [],
            outputs: nodeCategory !== 'load' ? ['out'] : [],
        };

        onChange({
            ...definition,
            nodes: [...definition.nodes, newNode],
        });
    };

    const handleUpdateNode = (updatedNode: PipelineNode) => {
        onChange({
            ...definition,
            nodes: definition.nodes.map(n => n.id === updatedNode.id ? updatedNode : n),
        });
        setSelectedNode(updatedNode);
    };

    const handleDeleteNode = (nodeId: string) => {
        onChange({
            ...definition,
            nodes: definition.nodes.filter(n => n.id !== nodeId),
            edges: definition.edges.filter(e => e.from !== nodeId && e.to !== nodeId),
        });
        if (selectedNode?.id === nodeId) {
            setSelectedNode(null);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const nodeType = e.dataTransfer.getData('nodeType');
        const category = e.dataTransfer.getData('category');
        if (nodeType && category) {
            handleAddNode(nodeType, category);
        }
    };

    return (
        <div className="flex h-full gap-4">
            {/* Node Palette */}
            {!readOnly && (
                <NodePalette onAddNode={handleAddNode} />
            )}

            {/* Canvas */}
            <div className="flex-1 flex flex-col">
                {/* Toolbar */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                            {definition.nodes.length} nodes
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                            {definition.edges.length} connections
                        </Badge>
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

                {/* Canvas Area */}
                <Card className="flex-1 relative overflow-hidden">
                    <div
                        ref={canvasRef}
                        className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] p-8 overflow-auto"
                        onDragOver={e => e.preventDefault()}
                        onDrop={handleDrop}
                    >
                        {definition.nodes.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-center text-muted-foreground">
                                    <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p className="text-lg font-medium">No nodes yet</p>
                                    <p className="text-sm">Drag operations from the palette to start building your pipeline</p>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-4 gap-6">
                                {definition.nodes.map(node => (
                                    <PipelineNodeComponent
                                        key={node.id}
                                        node={node}
                                        selected={selectedNode?.id === node.id}
                                        onSelect={() => setSelectedNode(node)}
                                        onDelete={() => handleDeleteNode(node.id)}
                                        onDragStart={e => {
                                            setDraggedNode(node.id);
                                        }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            {/* Properties Panel */}
            <NodePropertiesPanel
                node={selectedNode}
                schemas={schemas}
                connections={connections}
                onUpdate={handleUpdateNode}
                onClose={() => setSelectedNode(null)}
            />
        </div>
    );
}

export default PipelineCanvas;
