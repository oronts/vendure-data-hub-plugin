import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
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
    applyNodeChanges,
    applyEdgeChanges,
    NodeChange,
    EdgeChange,
    Panel,
    ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
    Button,
    Badge,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@vendure/dashboard';
import { NodePropertiesPanel } from './shared/NodePropertiesPanel';
import { PipelineSettingsPanel } from './shared/PipelineSettingsPanel';
import { pipelineNodeTypes } from './shared/PipelineNode';
import { useAdapterCatalog } from '../../hooks';
import {
    EDGE_STYLE,
    CANVAS_BG_CLASS,
    DATAHUB_NAV_LABELS,
} from '../../constants';
import type {
    PipelineContext,
    PipelineNodeData,
    VisualPipelineDefinition,
    ValidationIssue,
} from '../../types';
import {
    Play,
    Save,
    Layers,
    LayoutGrid,
    Settings2,
} from 'lucide-react';
import { layoutDagNodes } from '../../routes/pipelines/utils';
import { parsePaletteDragData, resolveCanvasPosition } from './canvas-position';
import { reconcileSelectedNode } from './node-selection';
import { DynamicNodePalette } from './DynamicNodePalette';
import {
    collectNodeIssueCounts,
    collectPipelineContextErrors,
    createPipelineEdge,
    createPipelineNode,
    decorateNodesWithIssueCounts,
    getVisualDefinitionKey,
    preserveNodePositions,
} from './pipeline-editor-graph';

const NODE_POSITION_JITTER_PX = 20;

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
    const { i18n, t } = useLingui();
    const [nodes, setNodes] = useNodesState(definition.nodes);
    const [edges, setEdges] = useEdgesState(definition.edges);
    const [selectedNode, setSelectedNode] = React.useState<Node<PipelineNodeData> | null>(null);
    const reactFlowRef = React.useRef<HTMLDivElement>(null);
    const reactFlowInstanceRef = React.useRef<ReactFlowInstance<
        Node<PipelineNodeData>,
        Edge
    > | null>(null);

    const isUpdatingRef = React.useRef(false);
    const nodesRef = React.useRef(nodes);
    nodesRef.current = nodes;
    const edgesRef = React.useRef(edges);
    edgesRef.current = edges;
    const pipelineContextErrors = React.useMemo(
        () => collectPipelineContextErrors(issues),
        [issues],
    );

    const lastSyncedKeyRef = React.useRef(getVisualDefinitionKey(definition));

    React.useEffect(() => {
        if (isUpdatingRef.current) {
            return;
        }

        const newKey = getVisualDefinitionKey(definition);
        const currentKey = lastSyncedKeyRef.current;

        if (newKey !== currentKey) {
            lastSyncedKeyRef.current = newKey;

            const updatedNodes = preserveNodePositions(
                definition.nodes,
                nodesRef.current,
            );

            setNodes(updatedNodes);
            setEdges(definition.edges);
            setSelectedNode(current => reconcileSelectedNode(current, updatedNodes));
        }
    }, [definition, setEdges, setNodes]);

    const notifyChange = React.useCallback((newNodes: Node<PipelineNodeData>[], newEdges: Edge[]) => {
        isUpdatingRef.current = true;

        const newDef = { ...definition, nodes: newNodes, edges: newEdges };
        lastSyncedKeyRef.current = getVisualDefinitionKey(newDef);

        onChange(newDef);

        queueMicrotask(() => {
            isUpdatingRef.current = false;
        });
    }, [definition, onChange]);

    const handleNodesChange = React.useCallback(
        (changes: NodeChange<Node<PipelineNodeData>>[]) => {
            const updatedNodes = applyNodeChanges(changes, nodesRef.current);
            nodesRef.current = updatedNodes;
            setNodes(updatedNodes);
            notifyChange(updatedNodes, edgesRef.current);
        },
        [notifyChange, setNodes],
    );

    const handleEdgesChange = React.useCallback(
        (changes: EdgeChange<Edge>[]) => {
            const updatedEdges = applyEdgeChanges(changes, edgesRef.current);
            edgesRef.current = updatedEdges;
            setEdges(updatedEdges);
            notifyChange(nodesRef.current, updatedEdges);
        },
        [notifyChange, setEdges],
    );

    const onConnect = React.useCallback((connection: Connection) => {
        const newEdge = createPipelineEdge(
            connection,
            `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        );
        setEdges(eds => {
            const newEdges = addEdge(newEdge, eds);
            notifyChange(nodes, newEdges as Edge[]);
            return newEdges;
        });
    }, [setEdges, nodes, notifyChange]);

    const onNodeClick = React.useCallback((_event: React.MouseEvent, node: Node) => {
        const sourceNode = nodesRef.current.find(candidate => candidate.id === node.id);
        setSelectedNode(sourceNode ?? node as Node<PipelineNodeData>);
    }, []);

    const onDragStart = React.useCallback((event: React.DragEvent, nodeType: string, category: string, label: string) => {
        event.dataTransfer.setData('application/reactflow', JSON.stringify({ nodeType, category, label }));
        event.dataTransfer.effectAllowed = 'move';
    }, []);

    /** Add a node directly to the canvas center. Used by keyboard accessibility path
     *  where a real drag-drop gesture is not possible. */
    const addNodeToCanvas = React.useCallback((nodeType: string, category: string, label: string) => {
        const bounds = reactFlowRef.current?.getBoundingClientRect();
        const center = bounds
            ? {
                x: bounds.left + bounds.width / 2,
                y: bounds.top + bounds.height / 2,
            }
            : { x: 300, y: 200 };
        const clientPosition = {
            x: center.x + Math.round(
                Math.random() * NODE_POSITION_JITTER_PX * 2 - NODE_POSITION_JITTER_PX,
            ),
            y: center.y + Math.round(
                Math.random() * NODE_POSITION_JITTER_PX * 2 - NODE_POSITION_JITTER_PX,
            ),
        };
        const position = resolveCanvasPosition(
            bounds ? reactFlowInstanceRef.current : null,
            clientPosition,
        );

        const newNode = createPipelineNode({
            id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            adapterCode: nodeType,
            category,
            label,
            position,
        });

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

            const dragData = parsePaletteDragData(data);
            if (!dragData) return;
            const { nodeType, category, label } = dragData;
            const position = resolveCanvasPosition(
                reactFlowInstanceRef.current,
                { x: event.clientX, y: event.clientY },
            );

            const newNode = createPipelineNode({
                id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                adapterCode: nodeType,
                category,
                label,
                position,
            });

            setNodes(nds => {
                const newNodes = [...nds, newNode];
                notifyChange(newNodes as Node<PipelineNodeData>[], edges);
                return newNodes;
            });
        },
        [setNodes, edges, notifyChange],
    );

    const updateNode = React.useCallback((updatedNode: Node<PipelineNodeData>) => {
        if (readOnly) return;
        setNodes(nds => {
            const newNodes = nds.map(n => n.id === updatedNode.id ? updatedNode : n);
            notifyChange(newNodes as Node<PipelineNodeData>[], edges);
            return newNodes;
        });
        setSelectedNode(updatedNode);
    }, [setNodes, edges, notifyChange, readOnly]);

    const deleteSelectedNode = React.useCallback(() => {
        if (!selectedNode || readOnly) return;
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
    }, [selectedNode, setNodes, setEdges, notifyChange, readOnly]);

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

    const {
        adapters,
        isLoading: catalogLoading,
        error: catalogError,
    } = useAdapterCatalog();

    const handleClosePropertiesPanel = React.useCallback(() => {
        setSelectedNode(null);
    }, []);

    const handlePipelineContextChange = React.useCallback((context: PipelineContext) => {
        onChange({
            ...definition,
            nodes: nodesRef.current,
            edges: edgesRef.current,
            variables: context as unknown as VisualPipelineDefinition['variables'],
        });
    }, [definition, onChange]);

    const issueMap = React.useMemo(() => collectNodeIssueCounts(issues), [issues]);

    const displayedNodes = React.useMemo<Node<PipelineNodeData>[]>(
        () => decorateNodesWithIssueCounts(nodes, issueMap),
        [issueMap, nodes],
    );

    const defaultEdgeOptions = React.useMemo(() => ({
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: EDGE_STYLE.STROKE_WIDTH },
    }), []);

    const nodeCountLabel = nodes.length === 1
        ? t`${nodes.length} node`
        : t`${nodes.length} nodes`;
    const connectionCountLabel = edges.length === 1
        ? t`${edges.length} connection`
        : t`${edges.length} connections`;

    return (
        <div className="flex h-full min-w-0 flex-col gap-4 lg:flex-row">
            {!readOnly && (
                <DynamicNodePalette
                    adapters={adapters}
                    onDragStart={onDragStart}
                    onAddNode={addNodeToCanvas}
                />
            )}

            <div className="flex min-h-[32rem] min-w-0 flex-1 flex-col">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{nodeCountLabel}</Badge>
                        <Badge variant="outline">{connectionCountLabel}</Badge>
                        {!readOnly && (
                            <Button variant="ghost" size="sm" onClick={autoLayout} className="gap-1 text-xs" data-testid="datahub-pipeline-editor-auto-layout-button" aria-label={t`Auto-layout pipeline nodes`}>
                                <LayoutGrid className="w-3 h-3" />
                                <Trans>Auto-layout</Trans>
                            </Button>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {!readOnly && (
                            <Sheet>
                                <SheetTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="gap-2"
                                        data-testid="datahub-pipeline-editor-settings-button"
                                    >
                                        <Settings2 className="w-4 h-4" />
                                        {i18n._(DATAHUB_NAV_LABELS.SETTINGS)}
                                    </Button>
                                </SheetTrigger>
                                <SheetContent className="w-full p-0 sm:max-w-xl">
                                    <SheetHeader className="sr-only">
                                        <SheetTitle>
                                            <Trans>Pipeline settings</Trans>
                                        </SheetTitle>
                                    </SheetHeader>
                                    <PipelineSettingsPanel
                                        context={(definition.variables ?? {}) as PipelineContext}
                                        onChange={handlePipelineContextChange}
                                        errors={pipelineContextErrors}
                                    />
                                </SheetContent>
                            </Sheet>
                        )}
                        {onRun && (
                            <Button onClick={onRun} className="gap-2" data-testid="datahub-pipeline-editor-run-button">
                                <Play className="w-4 h-4" />
                                <Trans>Run Pipeline</Trans>
                            </Button>
                        )}
                        {onSave && (
                            <Button variant="outline" onClick={onSave} className="gap-2" data-testid="datahub-pipeline-editor-save-button">
                                <Save className="w-4 h-4" />
                                <Trans>Save</Trans>
                            </Button>
                        )}
                    </div>
                </div>

                <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border" ref={reactFlowRef} data-testid="datahub-pipeline-editor-canvas" aria-label={t`Pipeline editor canvas`} role="application">
                    <ReactFlow
                        nodes={displayedNodes}
                        edges={edges}
                        onNodesChange={readOnly ? undefined : handleNodesChange}
                        onEdgesChange={readOnly ? undefined : handleEdgesChange}
                        onConnect={readOnly ? undefined : onConnect}
                        onNodeClick={onNodeClick}
                        onDragOver={readOnly ? undefined : onDragOver}
                        onDrop={readOnly ? undefined : onDrop}
                        nodesDraggable={!readOnly}
                        nodesConnectable={!readOnly}
                        edgesReconnectable={!readOnly}
                        nodeTypes={pipelineNodeTypes}
                        defaultEdgeOptions={defaultEdgeOptions}
                        onInit={instance => {
                            reactFlowInstanceRef.current = instance;
                        }}
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
                                    <p className="text-lg font-medium">
                                        <Trans>Start Building Your Pipeline</Trans>
                                    </p>
                                    <p className="text-sm mt-1">
                                        <Trans>Drag nodes from the palette and connect them</Trans>
                                    </p>
                                </div>
                            </Panel>
                        )}
                    </ReactFlow>
                </div>
            </div>

            <NodePropertiesPanel
                node={selectedNode}
                catalog={adapters}
                onUpdate={updateNode}
                onDelete={deleteSelectedNode}
                onClose={handleClosePropertiesPanel}
                readOnly={readOnly}
                issues={issues}
                catalogLoading={catalogLoading}
                catalogError={catalogError}
            />
        </div>
    );
}
