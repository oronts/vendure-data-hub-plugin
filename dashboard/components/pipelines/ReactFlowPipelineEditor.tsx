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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Badge,
    ScrollArea,
} from '@vendure/dashboard';
import { NodePropertiesPanel } from './shared/NodePropertiesPanel';
import { pipelineNodeTypes } from './shared/PipelineNode';
import { useAdapterCatalog, AdapterMetadata } from '../../hooks';
import { ADAPTER_TYPES, ADAPTER_TYPE_TO_NODE_TYPE, PANEL_WIDTHS, SCROLL_HEIGHTS, EDGE_STYLE, CANVAS_BG_CLASS } from '../../constants';
import type { PipelineNodeData, VisualPipelineDefinition, ValidationIssue } from '../../types';
import {
    Play,
    Save,
    ChevronRight,
    ChevronDown,
    Layers,
    LayoutGrid,
} from 'lucide-react';
import { layoutDagNodes } from '../../routes/pipelines/utils';
import { VISUAL_NODE_CONFIGS } from './shared/visual-node-config';
import type { VisualNodeCategory } from '../../types';

export interface ReactFlowPipelineEditorProps {
    definition: VisualPipelineDefinition;
    onChange: (definition: VisualPipelineDefinition) => void;
    onRun?: () => void;
    onSave?: () => void;
    readOnly?: boolean;
    issues?: ValidationIssue[];
}

export function ReactFlowPipelineEditor({
    definition,
    onChange,
    onRun,
    onSave,
    readOnly = false,
    issues = [],
}: ReactFlowPipelineEditorProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState(definition.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(definition.edges);
    const [selectedNode, setSelectedNode] = React.useState<Node<PipelineNodeData> | null>(null);
    const reactFlowRef = React.useRef<HTMLDivElement>(null);

    const isUpdatingRef = React.useRef(false);

    const getDefinitionKey = React.useCallback((def: VisualPipelineDefinition | null) => {
        if (!def) return '';
        const nodesKey = (def.nodes || [])
            .map(n => `${n.id}:${JSON.stringify(n.data)}`)
            .sort()
            .join('|');
        const edgesKey = (def.edges || [])
            .map(e => `${e.source}->${e.target}`)
            .sort()
            .join('|');
        return `${nodesKey}::${edgesKey}`;
    }, []);

    const lastSyncedKeyRef = React.useRef(getDefinitionKey(definition));

    React.useEffect(() => {
        if (isUpdatingRef.current) {
            return;
        }

        const newKey = getDefinitionKey(definition);
        const currentKey = lastSyncedKeyRef.current;

        if (newKey !== currentKey) {
            lastSyncedKeyRef.current = newKey;

            const positionMap = new Map(nodes.map(n => [n.id, n.position]));

            const updatedNodes = definition.nodes.map(n => ({
                ...n,
                position: positionMap.get(n.id) || n.position,
            }));

            setNodes(updatedNodes);
            setEdges(definition.edges);
        }
    }, [definition, nodes, setNodes, setEdges, getDefinitionKey]);

    const notifyChange = React.useCallback((newNodes: Node<PipelineNodeData>[], newEdges: Edge[]) => {
        isUpdatingRef.current = true;

        const newDef = { ...definition, nodes: newNodes, edges: newEdges };
        lastSyncedKeyRef.current = getDefinitionKey(newDef);

        const { steps: _steps, ...visualDef } = definition;
        onChange({ ...visualDef, nodes: newNodes, edges: newEdges });

        Promise.resolve().then(() => {
            isUpdatingRef.current = false;
        });
    }, [definition, onChange, getDefinitionKey]);

    const onConnect = React.useCallback((connection: Connection) => {
        const newEdge: Edge = {
            ...connection,
            id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { strokeWidth: EDGE_STYLE.STROKE_WIDTH },
        } as Edge;
        setEdges(eds => {
            const newEdges = addEdge(newEdge, eds);
            notifyChange(nodes, newEdges as Edge[]);
            return newEdges;
        });
    }, [setEdges, nodes, notifyChange]);

    const onNodeClick = React.useCallback((_event: React.MouseEvent, node: Node) => {
        setSelectedNode(node as Node<PipelineNodeData>);
    }, []);

    const onDragStart = React.useCallback((event: React.DragEvent, nodeType: string, category: string, label: string) => {
        event.dataTransfer.setData('application/reactflow', JSON.stringify({ nodeType, category, label }));
        event.dataTransfer.effectAllowed = 'move';
    }, []);

    /** Add a node directly to the canvas center -- used by keyboard accessibility path
     *  where a real drag-drop gesture is not possible. */
    const addNodeToCanvas = React.useCallback((nodeType: string, category: string, label: string) => {
        const bounds = reactFlowRef.current?.getBoundingClientRect();
        const position = {
            x: (bounds ? bounds.width / 2 : 300) + Math.round(Math.random() * 40 - 20),
            y: (bounds ? bounds.height / 2 : 200) + Math.round(Math.random() * 40 - 20),
        };

        const newNode: Node<PipelineNodeData> = {
            id: `node-${Date.now()}`,
            type: category,
            position,
            data: {
                label,
                type: category,
                adapterCode: nodeType,
                config: { adapterCode: nodeType },
            },
        };

        setNodes(nds => {
            const newNodes = [...nds, newNode];
            notifyChange(newNodes as Node<PipelineNodeData>[], edges);
            return newNodes;
        });
    }, [setNodes, edges, notifyChange]);

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
            const reactFlowBounds = reactFlowRef.current?.getBoundingClientRect();
            const position = {
                x: event.clientX - (reactFlowBounds?.left ?? 0),
                y: event.clientY - (reactFlowBounds?.top ?? 0),
            };

            const newNode: Node<PipelineNodeData> = {
                id: `node-${Date.now()}`,
                type: category,
                position,
                data: {
                    label,
                    type: category,
                    adapterCode: nodeType,
                    config: { adapterCode: nodeType },
                },
            };

            setNodes(nds => {
                const newNodes = [...nds, newNode];
                notifyChange(newNodes as Node<PipelineNodeData>[], edges);
                return newNodes;
            });
        },
        [setNodes, edges, notifyChange],
    );

    const updateNode = React.useCallback((updatedNode: Node<PipelineNodeData>) => {
        setNodes(nds => {
            const newNodes = nds.map(n => n.id === updatedNode.id ? updatedNode : n);
            notifyChange(newNodes as Node<PipelineNodeData>[], edges);
            return newNodes;
        });
        setSelectedNode(updatedNode);
    }, [setNodes, edges, notifyChange]);

    const deleteSelectedNode = React.useCallback(() => {
        if (!selectedNode) return;
        setNodes(nds => {
            const newNodes = nds.filter(n => n.id !== selectedNode.id);
            setEdges(eds => {
                const newEdges = eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id);
                notifyChange(newNodes as Node<PipelineNodeData>[], newEdges);
                return newEdges;
            });
            return newNodes;
        });
        setSelectedNode(null);
    }, [selectedNode, setNodes, setEdges, notifyChange]);

    const autoLayout = React.useCallback(() => {
        if (nodes.length === 0) {
            return;
        }

        const currentDef = { ...definition, nodes, edges };
        const layoutedDef = layoutDagNodes(currentDef);
        const repositionedNodes = layoutedDef.nodes;

        setNodes(repositionedNodes);
        notifyChange(repositionedNodes as Node<PipelineNodeData>[], edges);
    }, [nodes, edges, definition, setNodes, notifyChange]);

    const { adapters, connectionCodes, secretOptions } = useAdapterCatalog();

    const handleClosePropertiesPanel = React.useCallback(() => {
        setSelectedNode(null);
    }, []);

    const handleAutoLayout = React.useCallback(() => {
        autoLayout();
    }, [autoLayout]);

    const issueMap = React.useMemo(() => {
        const issueCountMap = new Map<string, number>();
        for (const issue of issues) {
            if (!issue.stepKey) continue;
            issueCountMap.set(issue.stepKey, (issueCountMap.get(issue.stepKey) || 0) + 1);
        }
        return issueCountMap;
    }, [issues]);

    const defaultEdgeOptions = React.useMemo(() => ({
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: EDGE_STYLE.STROKE_WIDTH },
    }), []);

    return (
        <div className="flex h-full gap-4">
            {!readOnly && (
                <NodePaletteDynamic adapters={adapters} onDragStart={onDragStart} onAddNode={addNodeToCanvas} />
            )}

            <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline">{nodes.length} nodes</Badge>
                        <Badge variant="outline">{edges.length} connections</Badge>
                        {!readOnly && (
                            <Button variant="ghost" size="sm" onClick={handleAutoLayout} className="gap-1 text-xs" data-testid="datahub-pipeline-editor-auto-layout-button" aria-label="Auto-layout pipeline nodes">
                                <LayoutGrid className="w-3 h-3" />
                                Auto-layout
                            </Button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {onRun && (
                            <Button onClick={onRun} className="gap-2" data-testid="datahub-pipeline-editor-run-button">
                                <Play className="w-4 h-4" />
                                Run Pipeline
                            </Button>
                        )}
                        {onSave && (
                            <Button variant="outline" onClick={onSave} className="gap-2" data-testid="datahub-pipeline-editor-save-button">
                                <Save className="w-4 h-4" />
                                Save
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex-1 border rounded-lg overflow-hidden" ref={reactFlowRef} data-testid="datahub-pipeline-editor-canvas">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={readOnly ? undefined : onNodesChange}
                        onEdgesChange={readOnly ? undefined : onEdgesChange}
                        onConnect={readOnly ? undefined : onConnect}
                        onNodeClick={onNodeClick}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        nodeTypes={pipelineNodeTypes}
                        defaultEdgeOptions={defaultEdgeOptions}
                        fitView
                        className={CANVAS_BG_CLASS}
                    >
                        <Background />
                        <Controls />
                        <MiniMap
                            nodeStrokeWidth={3}
                            zoomable
                            pannable
                        />
                        {nodes.length === 0 && (
                            <Panel position="top-center" className="mt-20">
                                <div className="text-center text-muted-foreground bg-background/80 p-6 rounded-lg">
                                    <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p className="text-lg font-medium">Start Building Your Pipeline</p>
                                    <p className="text-sm mt-1">
                                        Drag nodes from the palette and connect them
                                    </p>
                                </div>
                            </Panel>
                        )}
                        {nodes.map(n => {
                            const count = issueMap.get(n.id) || 0;
                            if (!count) return null;
                            return (
                                <Panel key={`iss-${n.id}`} position="top-left">
                                    <div style={{ position: 'absolute', transform: `translate(${n.position.x + 8}px, ${n.position.y - 6}px)` }}>
                                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-800">{count}</span>
                                    </div>
                                </Panel>
                            );
                        })}
                    </ReactFlow>
                </div>
            </div>

            <NodePropertiesPanel
                node={selectedNode}
                catalog={adapters}
                connectionCodes={connectionCodes}
                secretOptions={secretOptions}
                onUpdate={updateNode}
                onDelete={deleteSelectedNode}
                onClose={handleClosePropertiesPanel}
            />
        </div>
    );
}

// Memoized adapter palette item to avoid inline onDragStart handlers
interface PaletteAdapterItemProps {
    readonly adapter: AdapterMetadata;
    readonly category: string;
    readonly onDragStart: (e: React.DragEvent, nodeType: string, category: string, label: string) => void;
    readonly onAddNode: (nodeType: string, category: string, label: string) => void;
}

const PaletteAdapterItem = React.memo(function PaletteAdapterItem({
    adapter,
    category,
    onDragStart,
    onAddNode,
}: PaletteAdapterItemProps) {
    const Icon = adapter.icon;

    const handleDragStart = React.useCallback((e: React.DragEvent) => {
        onDragStart(e, adapter.code, category, adapter.name);
    }, [onDragStart, adapter.code, category, adapter.name]);

    const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onAddNode(adapter.code, category, adapter.name);
        }
    }, [onAddNode, adapter.code, category, adapter.name]);

    return (
        <div
            className="border rounded p-2 cursor-move hover:bg-muted active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            draggable
            onDragStart={handleDragStart}
            onKeyDown={handleKeyDown}
            title={adapter.description || ''}
            role="button"
            tabIndex={0}
            aria-label={`Add ${adapter.name} node to pipeline`}
        >
            <div className="flex items-center gap-2">
                <div
                    className="w-6 h-6 rounded flex items-center justify-center text-white"
                    style={{ backgroundColor: adapter.color }}
                >
                    <Icon className="w-3 h-3" />
                </div>
                <div className="truncate text-xs flex-1 min-w-0">
                    <div className="font-medium truncate">{adapter.name}</div>
                    {adapter.description && (
                        <div className="text-[10px] text-muted-foreground truncate">
                            {adapter.description}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

// Memoized section header button to avoid inline onClick handlers
interface PaletteSectionHeaderProps {
    readonly sectionKey: string;
    readonly label: string;
    readonly Icon: React.ComponentType<{ className?: string }>;
    readonly isExpanded: boolean;
    readonly onToggle: (key: string) => void;
}

const PaletteSectionHeader = React.memo(function PaletteSectionHeader({
    sectionKey,
    label,
    Icon,
    isExpanded,
    onToggle,
}: PaletteSectionHeaderProps) {
    const handleClick = React.useCallback(() => {
        onToggle(sectionKey);
    }, [onToggle, sectionKey]);

    return (
        <button
            type="button"
            className="w-full flex items-center justify-between px-2 py-1.5 text-sm font-medium hover:bg-muted rounded"
            onClick={handleClick}
            aria-expanded={isExpanded}
        >
            <span className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-muted-foreground" />
                {label}
            </span>
            {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
            ) : (
                <ChevronRight className="w-4 h-4" />
            )}
        </button>
    );
});

function NodePaletteDynamic({ adapters, onDragStart, onAddNode }: { adapters: AdapterMetadata[]; onDragStart: (e: React.DragEvent, nodeType: string, category: string, label: string) => void; onAddNode: (nodeType: string, category: string, label: string) => void }) {
    const [expanded, setExpanded] = React.useState<Record<string, boolean>>({
        sources: true,
        transforms: true,
        validation: false,
        routing: true,
        destinations: true,
        feeds: false,
        exports: false,
        sinks: false,
    });

    const handleToggleSection = React.useCallback((sectionKey: string) => {
        setExpanded(e => ({ ...e, [sectionKey]: !e[sectionKey] }));
    }, []);

    const sections = React.useMemo(() => {
        const adapterTypeEntries = Object.values(ADAPTER_TYPES) as string[];
        return adapterTypeEntries
            .map(adapterType => {
                const category = ADAPTER_TYPE_TO_NODE_TYPE[adapterType] as VisualNodeCategory | undefined;
                if (!category) return null;
                const config = VISUAL_NODE_CONFIGS[category];
                if (!config) return null;
                const items = adapters.filter(a => a.type === adapterType);
                return {
                    key: category,
                    label: config.label === 'Source' ? 'Data Sources' : `${config.label}s`,
                    items,
                    category,
                    icon: config.icon,
                };
            })
            .filter((s): s is NonNullable<typeof s> => s !== null && s.items.length > 0);
    }, [adapters]);

    return (
        <Card className={`${PANEL_WIDTHS.NODE_PALETTE} h-full overflow-hidden flex flex-col`}>
            <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Node Palette
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-hidden">
                <ScrollArea className={SCROLL_HEIGHTS.NODE_PALETTE}>
                    <div className="space-y-1 p-2">
                        {sections.map(section => (
                            <div key={section.key}>
                                <PaletteSectionHeader
                                    sectionKey={section.key}
                                    label={section.label}
                                    Icon={section.icon}
                                    isExpanded={expanded[section.key]}
                                    onToggle={handleToggleSection}
                                />
                                {expanded[section.key] && (
                                    <div className="grid grid-cols-2 gap-2 px-2 py-2">
                                        {section.items.map(adapter => (
                                            <PaletteAdapterItem
                                                key={adapter.code}
                                                adapter={adapter}
                                                category={section.category}
                                                onDragStart={onDragStart}
                                                onAddNode={onAddNode}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
