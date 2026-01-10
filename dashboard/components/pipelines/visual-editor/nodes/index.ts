/**
 * Pipeline Node Components
 * Barrel export for all node components
 */

export { BaseNode } from './BaseNode';
export { SourceNode } from './SourceNode';
export { TransformNode } from './TransformNode';
export { ValidateNode } from './ValidateNode';
export { ConditionNode } from './ConditionNode';
export { LoadNode } from './LoadNode';
export { FeedNode } from './FeedNode';
export { ExportNode } from './ExportNode';

// Node types registry for ReactFlow
export const nodeTypes = {
    source: SourceNode,
    transform: TransformNode,
    validate: ValidateNode,
    condition: ConditionNode,
    filter: TransformNode,
    load: LoadNode,
    feed: FeedNode,
    export: ExportNode,
};

// Import individual components for registry
import { SourceNode } from './SourceNode';
import { TransformNode } from './TransformNode';
import { ValidateNode } from './ValidateNode';
import { ConditionNode } from './ConditionNode';
import { LoadNode } from './LoadNode';
import { FeedNode } from './FeedNode';
import { ExportNode } from './ExportNode';
