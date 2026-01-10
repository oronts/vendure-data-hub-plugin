import * as React from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    addEdge,
    useNodesState,
    useEdgesState,
    Handle,
    Position,
    MarkerType,
    NodeProps,
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
import { useAdapterCatalog, AdapterMetadata, AdapterNodeType } from '../../hooks/index';
import { VENDURE_EVENTS, VENDURE_EVENTS_BY_CATEGORY } from '../../constants/index';
import {
    Play,
    Save,
    Download,
    Upload,
    RefreshCw,
    CheckCircle,
    GitBranch,
    Globe,
    Layers,
    ChevronRight,
    ChevronDown,
} from 'lucide-react';

// TYPES

/**
 * Visual node category type - matches all backend StepType values for lossless conversion
 */
type VisualNodeCategory = 'trigger' | 'source' | 'transform' | 'validate' | 'condition' | 'load' | 'feed' | 'export' | 'sink' | 'enrich' | 'filter';

interface PipelineNodeData {
    label: string;
    type: VisualNodeCategory;
    adapterCode?: string;
    config: Record<string, any>;
    status?: 'idle' | 'running' | 'success' | 'error';
}

interface PipelineDefinition {
    nodes: Node<PipelineNodeData>[];
    edges: Edge[];
    variables?: Record<string, any>;
}

// CUSTOM NODE COMPONENTS

function TriggerNode({ data, selected }: NodeProps<Node<PipelineNodeData>>) {
    const color = '#10b981';

    return (
        <div
            className={`min-w-[180px] rounded-lg border-2 bg-white shadow-md transition-all ${
                selected ? 'border-emerald-500 shadow-lg' : 'border-gray-200'
            }`}
        >
            <div
                className="px-3 py-2 rounded-t-lg text-white flex items-center gap-2"
                style={{ backgroundColor: color }}
            >
                <Play className="w-4 h-4" />
                <span className="font-medium text-sm truncate">{data.label}</span>
            </div>
            <div className="px-3 py-2 text-xs text-gray-500">Pipeline trigger</div>
            <Handle type="source" position={Position.Right} className="!bg-emerald-500 !w-3 !h-3" />
        </div>
    );
}

function SourceNode({ data, selected }: NodeProps<Node<PipelineNodeData>>) {
    const Icon = Globe;
    const color = '#3b82f6';

    return (
        <div
            className={`min-w-[180px] rounded-lg border-2 bg-white shadow-md transition-all ${
                selected ? 'border-blue-500 shadow-lg' : 'border-gray-200'
            }`}
        >
            <Handle type="target" position={Position.Left} className="!bg-blue-500 !w-3 !h-3" />
            <div
                className="px-3 py-2 rounded-t-lg text-white flex items-center gap-2"
                style={{ backgroundColor: color }}
            >
                <Icon className="w-4 h-4" />
                <span className="font-medium text-sm truncate">{data.label}</span>
            </div>
            <div className="px-3 py-2 text-xs text-gray-500">Data source</div>
            {data.status === 'running' && (
                <div className="px-3 pb-2">
                    <Badge variant="secondary" className="animate-pulse">Running...</Badge>
                </div>
            )}
            <Handle type="source" position={Position.Right} className="!bg-blue-500 !w-3 !h-3" />
        </div>
    );
}

function TransformNode({ data, selected }: NodeProps<Node<PipelineNodeData>>) {
    const Icon = RefreshCw;
    const color = '#8b5cf6';

    return (
        <div
            className={`min-w-[180px] rounded-lg border-2 bg-white shadow-md transition-all ${
                selected ? 'border-purple-500 shadow-lg' : 'border-gray-200'
            }`}
        >
            <Handle type="target" position={Position.Left} className="!bg-purple-500 !w-3 !h-3" />
            <div
                className="px-3 py-2 rounded-t-lg text-white flex items-center gap-2"
                style={{ backgroundColor: color }}
            >
                <Icon className="w-4 h-4" />
                <span className="font-medium text-sm truncate">{data.label}</span>
            </div>
            <div className="px-3 py-2 text-xs text-gray-500">Transform data</div>
            <Handle type="source" position={Position.Right} className="!bg-purple-500 !w-3 !h-3" />
        </div>
    );
}

function ValidateNode({ data, selected }: NodeProps<Node<PipelineNodeData>>) {
    const Icon = CheckCircle;
    const color = '#22c55e';

    return (
        <div
            className={`min-w-[180px] rounded-lg border-2 bg-white shadow-md transition-all ${
                selected ? 'border-green-500 shadow-lg' : 'border-gray-200'
            }`}
        >
            <Handle type="target" position={Position.Left} className="!bg-green-500 !w-3 !h-3" />
            <div
                className="px-3 py-2 rounded-t-lg text-white flex items-center gap-2"
                style={{ backgroundColor: color }}
            >
                <Icon className="w-4 h-4" />
                <span className="font-medium text-sm truncate">{data.label}</span>
            </div>
            <div className="px-3 py-2 text-xs text-gray-500">Validate data</div>
            <Handle type="source" position={Position.Right} className="!bg-green-500 !w-3 !h-3" />
        </div>
    );
}

function ConditionNode({ data, selected }: NodeProps<Node<PipelineNodeData>>) {
    return (
        <div
            className={`min-w-[180px] rounded-lg border-2 bg-white shadow-md transition-all ${
                selected ? 'border-orange-500 shadow-lg' : 'border-gray-200'
            }`}
        >
            <Handle type="target" position={Position.Left} className="!bg-orange-500 !w-3 !h-3" />
            <div className="px-3 py-2 rounded-t-lg text-white flex items-center gap-2 bg-orange-500">
                <GitBranch className="w-4 h-4" />
                <span className="font-medium text-sm truncate">{data.label}</span>
            </div>
            <div className="px-3 py-2 text-xs text-gray-500">
                Route based on condition
            </div>
            <Handle
                type="source"
                position={Position.Right}
                id="true"
                className="!bg-green-500 !w-3 !h-3"
                style={{ top: '40%' }}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="false"
                className="!bg-red-500 !w-3 !h-3"
                style={{ top: '60%' }}
            />
        </div>
    );
}

function LoadNode({ data, selected }: NodeProps<Node<PipelineNodeData>>) {
    const Icon = Upload;
    const color = '#6366f1';

    return (
        <div
            className={`min-w-[180px] rounded-lg border-2 bg-white shadow-md transition-all ${
                selected ? 'border-indigo-500 shadow-lg' : 'border-gray-200'
            }`}
        >
            <Handle type="target" position={Position.Left} className="!bg-indigo-500 !w-3 !h-3" />
            <div
                className="px-3 py-2 rounded-t-lg text-white flex items-center gap-2"
                style={{ backgroundColor: color }}
            >
                <Icon className="w-4 h-4" />
                <span className="font-medium text-sm truncate">{data.label}</span>
            </div>
            <div className="px-3 py-2 text-xs text-gray-500">Load to destination</div>
            {data.status === 'success' && (
                <div className="px-3 pb-2">
                    <Badge className="bg-green-500">Complete</Badge>
                </div>
            )}
            {data.status === 'error' && (
                <div className="px-3 pb-2">
                    <Badge variant="destructive">Error</Badge>
                </div>
            )}
        </div>
    );
}

function FeedNode({ data, selected }: NodeProps<Node<PipelineNodeData>>) {
    const color = '#f97316';

    return (
        <div
            className={`min-w-[180px] rounded-lg border-2 bg-white shadow-md transition-all ${
                selected ? 'border-orange-500 shadow-lg' : 'border-gray-200'
            }`}
        >
            <Handle type="target" position={Position.Left} className="!bg-orange-500 !w-3 !h-3" />
            <div
                className="px-3 py-2 rounded-t-lg text-white flex items-center gap-2"
                style={{ backgroundColor: color }}
            >
                <Globe className="w-4 h-4" />
                <span className="font-medium text-sm truncate">{data.label}</span>
            </div>
            <div className="px-3 py-2 text-xs text-gray-500">Generate product feed</div>
        </div>
    );
}

function ExportNode({ data, selected }: NodeProps<Node<PipelineNodeData>>) {
    const color = '#0ea5e9';

    return (
        <div
            className={`min-w-[180px] rounded-lg border-2 bg-white shadow-md transition-all ${
                selected ? 'border-sky-500 shadow-lg' : 'border-gray-200'
            }`}
        >
            <Handle type="target" position={Position.Left} className="!bg-sky-500 !w-3 !h-3" />
            <div
                className="px-3 py-2 rounded-t-lg text-white flex items-center gap-2"
                style={{ backgroundColor: color }}
            >
                <Download className="w-4 h-4" />
                <span className="font-medium text-sm truncate">{data.label}</span>
            </div>
            <div className="px-3 py-2 text-xs text-gray-500">Export to external system</div>
        </div>
    );
}

function SinkNode({ data, selected }: NodeProps<Node<PipelineNodeData>>) {
    const color = '#a855f7';

    return (
        <div
            className={`min-w-[180px] rounded-lg border-2 bg-white shadow-md transition-all ${
                selected ? 'border-purple-500 shadow-lg' : 'border-gray-200'
            }`}
        >
            <Handle type="target" position={Position.Left} className="!bg-purple-500 !w-3 !h-3" />
            <div
                className="px-3 py-2 rounded-t-lg text-white flex items-center gap-2"
                style={{ backgroundColor: color }}
            >
                <Layers className="w-4 h-4" />
                <span className="font-medium text-sm truncate">{data.label}</span>
            </div>
            <div className="px-3 py-2 text-xs text-gray-500">Index to search engine</div>
        </div>
    );
}

function EnrichNode({ data, selected }: NodeProps<Node<PipelineNodeData>>) {
    const color = '#ec4899';

    return (
        <div
            className={`min-w-[180px] rounded-lg border-2 bg-white shadow-md transition-all ${
                selected ? 'border-pink-500 shadow-lg' : 'border-gray-200'
            }`}
        >
            <Handle type="target" position={Position.Left} className="!bg-pink-500 !w-3 !h-3" />
            <div
                className="px-3 py-2 rounded-t-lg text-white flex items-center gap-2"
                style={{ backgroundColor: color }}
            >
                <RefreshCw className="w-4 h-4" />
                <span className="font-medium text-sm truncate">{data.label}</span>
            </div>
            <div className="px-3 py-2 text-xs text-gray-500">Enrich with additional data</div>
            <Handle type="source" position={Position.Right} className="!bg-pink-500 !w-3 !h-3" />
        </div>
    );
}

const nodeTypes = {
    trigger: TriggerNode,
    source: SourceNode,
    transform: TransformNode,
    validate: ValidateNode,
    condition: ConditionNode,
    filter: TransformNode,
    load: LoadNode,
    feed: FeedNode,
    export: ExportNode,
    sink: SinkNode,
    enrich: EnrichNode,
};

// NODE PALETTE

interface NodePaletteProps {
    onDragStart: (event: React.DragEvent, nodeType: string, category: string, label: string) => void;
}

function NodePalette({ onDragStart }: NodePaletteProps) {
    const [expanded, setExpanded] = React.useState<Record<string, boolean>>({
        sources: true,
        transforms: true,
        validation: true,
        routing: false,
        destinations: true,
    });

    const categories = [
        { key: 'sources', label: 'Data Sources', items: NODE_CATALOG.sources, category: 'source' },
        { key: 'transforms', label: 'Transforms', items: NODE_CATALOG.transforms, category: 'transform' },
        { key: 'validation', label: 'Validation', items: NODE_CATALOG.validation, category: 'validate' },
        { key: 'routing', label: 'Routing', items: NODE_CATALOG.routing, category: 'condition' },
        { key: 'destinations', label: 'Destinations', items: NODE_CATALOG.destinations, category: 'load' },
    ];

    return (
        <Card className="w-60 h-full">
            <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Node Palette
                </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
                <ScrollArea className="h-[calc(100vh-280px)]">
                    <div className="space-y-1">
                        {categories.map(cat => (
                            <div key={cat.key}>
                                <button
                                    className="w-full flex items-center justify-between px-2 py-1.5 text-sm font-medium hover:bg-muted rounded"
                                    onClick={() => setExpanded(e => ({ ...e, [cat.key]: !e[cat.key] }))}
                                >
                                    <span>{cat.label}</span>
                                    {expanded[cat.key] ? (
                                        <ChevronDown className="w-4 h-4" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4" />
                                    )}
                                </button>
                                {expanded[cat.key] && (
                                    <div className="ml-2 space-y-1 mt-1">
                                        {cat.items.map(item => (
                                            <div
                                                key={item.type}
                                                className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded cursor-grab active:cursor-grabbing"
                                                draggable
                                                onDragStart={e => onDragStart(e, item.type, cat.category, item.label)}
                                            >
                                                <div
                                                    className="w-6 h-6 rounded flex items-center justify-center text-white"
                                                    style={{ backgroundColor: item.color }}
                                                >
                                                    <item.icon className="w-3 h-3" />
                                                </div>
                                                <span className="truncate text-xs">{item.label}</span>
                                            </div>
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

// NodePropertiesPanel is imported from ./shared/NodePropertiesPanel

// MAIN COMPONENT

export interface ReactFlowPipelineEditorProps {
    definition: PipelineDefinition;
    onChange: (definition: PipelineDefinition) => void;
    onRun?: () => void;
    onSave?: () => void;
    readOnly?: boolean;
    issues?: Array<{ stepKey?: string | null; message: string; field?: string | null; reason?: string | null }>;
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
    const reactFlowRef = React.useRef<any>(null);

    // Track if we're in the middle of an update to prevent feedback loops
    const isUpdatingRef = React.useRef(false);

    // Store a stable reference to the last definition we synced from
    // Using a function to serialize for deep comparison
    const getDefinitionKey = React.useCallback((def: PipelineDefinition | null) => {
        if (!def) return '';
        // Create a stable key based on node IDs and their data
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

    // Sync nodes/edges from props when definition changes externally (e.g., form reset, import)
    React.useEffect(() => {
        // Don't sync if we're in the middle of an update
        if (isUpdatingRef.current) {
            return;
        }

        const newKey = getDefinitionKey(definition);
        const currentKey = lastSyncedKeyRef.current;

        // Only sync if the definition actually changed
        if (newKey !== currentKey) {
            lastSyncedKeyRef.current = newKey;

            // Preserve node positions from current state when syncing
            const positionMap = new Map(nodes.map(n => [n.id, n.position]));

            const updatedNodes = definition.nodes.map(n => ({
                ...n,
                // Keep existing position if available, otherwise use the definition position
                position: positionMap.get(n.id) || n.position,
            }));

            setNodes(updatedNodes);
            setEdges(definition.edges);
        }
    }, [definition, nodes, setNodes, setEdges, getDefinitionKey]);

    // Notify parent of changes - called explicitly by user actions, not by effect
    const notifyChange = React.useCallback((newNodes: Node<PipelineNodeData>[], newEdges: Edge[]) => {
        isUpdatingRef.current = true;

        // Update our sync key
        const newDef = { ...definition, nodes: newNodes, edges: newEdges };
        lastSyncedKeyRef.current = getDefinitionKey(newDef);

        // Only include visual format fields - exclude 'steps' to avoid conflict
        const { steps: _unused, ...visualDef } = definition;
        onChange({ ...visualDef, nodes: newNodes, edges: newEdges });

        // Reset the flag after a microtask to allow React to process the update
        Promise.resolve().then(() => {
            isUpdatingRef.current = false;
        });
    }, [definition, onChange, getDefinitionKey]);

    // Handle new connections
    const onConnect = React.useCallback((connection: Connection) => {
        const newEdge: Edge = {
            ...connection,
            id: `edge-${Date.now()}`,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { strokeWidth: 2 },
        } as Edge;
        setEdges(eds => {
            const newEdges = addEdge(newEdge, eds);
            // Notify parent of the change
            notifyChange(nodes, newEdges as Edge[]);
            return newEdges;
        });
    }, [setEdges, nodes, notifyChange]);

    // Handle node selection
    const onNodeClick = React.useCallback((_: any, node: Node) => {
        setSelectedNode(node as Node<PipelineNodeData>);
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
            const reactFlowBounds = reactFlowRef.current?.getBoundingClientRect();
            const position = reactFlowRef.current?.screenToFlowPosition?.({
                x: event.clientX,
                y: event.clientY,
            }) || { x: event.clientX - (reactFlowBounds?.left || 0), y: event.clientY - (reactFlowBounds?.top || 0) };

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
                // Notify parent of the change
                notifyChange(newNodes as Node<PipelineNodeData>[], edges);
                return newNodes;
            });
        },
        [setNodes, edges, notifyChange],
    );

    // Update node - used by properties panel
    const updateNode = React.useCallback((updatedNode: Node<PipelineNodeData>) => {
        setNodes(nds => {
            const newNodes = nds.map(n => n.id === updatedNode.id ? updatedNode : n);
            // Notify parent of the change immediately
            notifyChange(newNodes as Node<PipelineNodeData>[], edges);
            return newNodes;
        });
        setSelectedNode(updatedNode);
    }, [setNodes, edges, notifyChange]);

    // Delete node
    const deleteSelectedNode = React.useCallback(() => {
        if (!selectedNode) return;
        setNodes(nds => {
            const newNodes = nds.filter(n => n.id !== selectedNode.id);
            setEdges(eds => {
                const newEdges = eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id);
                // Notify parent of the change
                notifyChange(newNodes as Node<PipelineNodeData>[], newEdges);
                return newEdges;
            });
            return newNodes;
        });
        setSelectedNode(null);
    }, [selectedNode, setNodes, setEdges, notifyChange]);

    // Fetch adapter metadata, connections, secrets via hook
    const { catalog, adapters, connectionCodes, secretOptions } = useAdapterCatalog();

    // Issue lookup by stepKey
    const issueMap = React.useMemo(() => {
        const m = new Map<string, number>();
        for (const i of issues) {
            if (!i.stepKey) continue;
            m.set(i.stepKey, (m.get(i.stepKey) || 0) + 1);
        }
        return m;
    }, [issues]);

    return (
        <div className="flex h-full gap-4">
            {/* Node Palette (dynamic from adapters + core nodes) */}
            {!readOnly && (
                <NodePaletteDynamic adapters={adapters} onDragStart={onDragStart} />
            )}

            {/* ReactFlow Canvas */}
            <div className="flex-1 flex flex-col">
                {/* Toolbar */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline">{nodes.length} nodes</Badge>
                        <Badge variant="outline">{edges.length} connections</Badge>
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

                {/* Canvas */}
                <div className="flex-1 border rounded-lg overflow-hidden" ref={reactFlowRef}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={readOnly ? undefined : onNodesChange}
                        onEdgesChange={readOnly ? undefined : onEdgesChange}
                        onConnect={readOnly ? undefined : onConnect}
                        onNodeClick={onNodeClick}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        nodeTypes={nodeTypes}
                        defaultEdgeOptions={{
                            markerEnd: { type: MarkerType.ArrowClosed },
                            style: { strokeWidth: 2 },
                        }}
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

            {/* Properties Panel */}
            <NodePropertiesPanel
                node={selectedNode}
                catalog={adapters}
                connectionCodes={connectionCodes}
                secretOptions={secretOptions}
                onUpdate={updateNode}
                onDelete={deleteSelectedNode}
                onClose={() => setSelectedNode(null)}
            />
        </div>
    );
}

export default ReactFlowPipelineEditor;

// Dynamic palette using AdapterMetadata from useAdapterCatalog
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

    // Group adapters by category
    const sources = adapters.filter(a => a.type === 'extractor');
    const transforms = adapters.filter(a => a.type === 'operator');
    const enrichers = adapters.filter(a => a.type === 'enricher');
    const validation = adapters.filter(a => a.type === 'validator');
    const routing = adapters.filter(a => a.type === 'router');
    const destinations = adapters.filter(a => a.type === 'loader');
    const feeds = adapters.filter(a => a.type === 'feed');
    const exports = adapters.filter(a => a.type === 'exporter');
    const sinks = adapters.filter(a => a.type === 'sink');

    const sections = [
        { key: 'sources', label: 'Data Sources', items: sources, category: 'source', icon: Download },
        { key: 'transforms', label: 'Transforms', items: transforms, category: 'transform', icon: RefreshCw },
        { key: 'enrichers', label: 'Enrichers', items: enrichers, category: 'enrich', icon: RefreshCw },
        { key: 'validation', label: 'Validation', items: validation, category: 'validate', icon: CheckCircle },
        { key: 'routing', label: 'Routing', items: routing, category: 'condition', icon: GitBranch },
        { key: 'destinations', label: 'Destinations', items: destinations, category: 'load', icon: Upload },
        { key: 'feeds', label: 'Feeds', items: feeds, category: 'feed', icon: Globe },
        { key: 'exports', label: 'Exports', items: exports, category: 'export', icon: Globe },
        { key: 'sinks', label: 'Sinks', items: sinks, category: 'sink', icon: Layers },
    ].filter(s => s.items.length > 0);

    return (
        <Card className="w-[260px] h-full overflow-hidden">
            <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Node Palette
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-200px)]">
                    <div className="space-y-1 p-2">
                        {sections.map(section => (
                            <div key={section.key}>
                                <button
                                    className="w-full flex items-center justify-between px-2 py-1.5 text-sm font-medium hover:bg-muted rounded"
                                    onClick={() => setExpanded(e => ({ ...e, [section.key]: !e[section.key] }))}
                                >
                                    <span className="flex items-center gap-2">
                                        <section.icon className="w-4 h-4 text-muted-foreground" />
                                        {section.label}
                                    </span>
                                    {expanded[section.key] ? (
                                        <ChevronDown className="w-4 h-4" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4" />
                                    )}
                                </button>
                                {expanded[section.key] && (
                                    <div className="grid grid-cols-2 gap-2 px-2 py-2">
                                        {section.items.map(adapter => {
                                            const Icon = adapter.icon;
                                            return (
                                                <div
                                                    key={adapter.code}
                                                    className="border rounded p-2 cursor-move hover:bg-muted active:cursor-grabbing"
                                                    draggable
                                                    onDragStart={(e) => onDragStart(e, adapter.code, section.category, adapter.name)}
                                                    title={adapter.description || ''}
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
                                        })}
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
