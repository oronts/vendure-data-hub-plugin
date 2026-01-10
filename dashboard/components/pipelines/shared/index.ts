/**
 * Shared Pipeline Components
 * Barrel export for reusable pipeline editor components
 */

// Node Properties Panel
export { NodePropertiesPanel } from './NodePropertiesPanel';
export type {
    NodePropertiesPanelProps,
    PipelineNodeData,
    VisualNodeCategory,
    VendureEntitySchema,
} from './NodePropertiesPanel';

// Operator Cheat Sheet
export { OperatorCheatSheetButton } from './operator-cheatsheet';

// Advanced Editors
export {
    AdvancedMapEditor,
    AdvancedTemplateEditor,
    AdvancedWhenEditor,
    MultiOperatorEditor,
} from './advanced-editors';

// Step Tester
export { StepTester } from './step-tester';

// Adapter Icons (if exists)
export * from './adapter-icons';
