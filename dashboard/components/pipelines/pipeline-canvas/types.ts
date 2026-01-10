// =============================================================================
// TYPES
// =============================================================================

export interface PipelineNode {
    id: string;
    type: 'source' | 'transform' | 'validate' | 'filter' | 'load' | 'condition' | 'merge';
    name: string;
    config: Record<string, any>;
    position: { x: number; y: number };
    inputs: string[];
    outputs: string[];
}

export interface PipelineEdge {
    id: string;
    from: string;
    to: string;
    fromPort?: string;
    toPort?: string;
}

export interface PipelineDefinition {
    nodes: PipelineNode[];
    edges: PipelineEdge[];
    variables: Record<string, any>;
}

export interface SchemaOption {
    id: string;
    code: string;
    name: string;
}

export interface ConnectionOption {
    id: string;
    code: string;
    name: string;
    type: string;
}

export interface Condition {
    field: string;
    operator: string;
    value: string;
}

export interface PipelineCanvasProps {
    definition: PipelineDefinition;
    schemas: SchemaOption[];
    connections: ConnectionOption[];
    onChange: (definition: PipelineDefinition) => void;
    onRun?: () => void;
    onSave?: () => void;
    readOnly?: boolean;
}

export interface PipelineNodeProps {
    node: PipelineNode;
    selected: boolean;
    onSelect: () => void;
    onDelete: () => void;
    onDragStart: (e: React.DragEvent) => void;
}

export interface NodePropertiesProps {
    node: PipelineNode | null;
    schemas: SchemaOption[];
    connections: ConnectionOption[];
    onUpdate: (node: PipelineNode) => void;
    onClose: () => void;
}
