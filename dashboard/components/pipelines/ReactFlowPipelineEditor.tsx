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
import { ADAPTER_TYPES, PANEL_WIDTHS, SCROLL_HEIGHTS } from '../../constants';
import type { PipelineNodeData, VisualPipelineDefinition, ValidationIssue } from '../../types';
import {
    Play,
    Save,
    ChevronRight,
    ChevronDown,
    Download,
    Upload,
    RefreshCw,
    CheckCircle,
    GitBranch,
    Globe,
    Layers,
    LayoutGrid,
} from 'lucide-react';
import { layoutDagNodes } from '../../routes/pipelines/utils';

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
            id: `edge-${Date.now()}`,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { strokeWidth: 2 },
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
        style: { strokeWidth: 2 },
    }), []);

    return (
        <div className="flex h-full gap-4">
            {!readOnly && (
                <NodePaletteDynamic adapters={adapters} onDragStart={onDragStart} />
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
                        className="bg-gray-50"
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
                                <div className="text-center text-muted-foreground bg-white/80 p-6 rounded-lg">
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
}

const PaletteAdapterItem = React.memo(function PaletteAdapterItem({
    adapter,
    category,
    onDragStart,
}: PaletteAdapterItemProps) {
    const Icon = adapter.icon;

    const handleDragStart = React.useCallback((e: React.DragEvent) => {
        onDragStart(e, adapter.code, category, adapter.name);
    }, [onDragStart, adapter.code, category, adapter.name]);

    const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            // Create a synthetic drag event for keyboard users
            const syntheticEvent = {
                dataTransfer: {
                    setData: (_type: string, _data: string) => { /* no-op for keyboard-initiated drag */ },
                    effectAllowed: 'move',
                },
            } as unknown as React.DragEvent;
            onDragStart(syntheticEvent, adapter.code, category, adapter.name);
        }
    }, [onDragStart, adapter.code, category, adapter.name]);

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

function NodePaletteDynamic({ adapters, onDragStart }: { adapters: AdapterMetadata[]; onDragStart: (e: React.DragEvent, nodeType: string, category: string, label: string) => void }) {
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

    const sources = React.useMemo(() => adapters.filter(a => a.type === ADAPTER_TYPES.EXTRACTOR), [adapters]);
    const transforms = React.useMemo(() => adapters.filter(a => a.type === ADAPTER_TYPES.OPERATOR), [adapters]);
    const enrichers = React.useMemo(() => adapters.filter(a => a.type === ADAPTER_TYPES.ENRICHER), [adapters]);
    const validation = React.useMemo(() => adapters.filter(a => a.type === ADAPTER_TYPES.VALIDATOR), [adapters]);
    const routing = React.useMemo(() => adapters.filter(a => a.type === ADAPTER_TYPES.ROUTER), [adapters]);
    const destinations = React.useMemo(() => adapters.filter(a => a.type === ADAPTER_TYPES.LOADER), [adapters]);
    const feeds = React.useMemo(() => adapters.filter(a => a.type === ADAPTER_TYPES.FEED), [adapters]);
    const exports = React.useMemo(() => adapters.filter(a => a.type === ADAPTER_TYPES.EXPORTER), [adapters]);
    const sinks = React.useMemo(() => adapters.filter(a => a.type === ADAPTER_TYPES.SINK), [adapters]);

    const sections = React.useMemo(() => [
        { key: 'sources', label: 'Data Sources', items: sources, category: 'source', icon: Download },
        { key: 'transforms', label: 'Transforms', items: transforms, category: 'transform', icon: RefreshCw },
        { key: 'enrichers', label: 'Enrichers', items: enrichers, category: 'enrich', icon: RefreshCw },
        { key: 'validation', label: 'Validation', items: validation, category: 'validate', icon: CheckCircle },
        { key: 'routing', label: 'Routing', items: routing, category: 'condition', icon: GitBranch },
        { key: 'destinations', label: 'Destinations', items: destinations, category: 'load', icon: Upload },
        { key: 'feeds', label: 'Feeds', items: feeds, category: 'feed', icon: Globe },
        { key: 'exports', label: 'Exports', items: exports, category: 'export', icon: Globe },
        { key: 'sinks', label: 'Sinks', items: sinks, category: 'sink', icon: Layers },
    ].filter(s => s.items.length > 0), [sources, transforms, enrichers, validation, routing, destinations, feeds, exports, sinks]);

    return (
        <Card className={`${PANEL_WIDTHS.NODE_PALETTE} h-full overflow-hidden`}>
            <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Node Palette
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
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
