/**
 * Import Wizard Components
 * Barrel export for the import wizard module
 */

// Main component
export { ImportWizard } from './ImportWizard';
export { default } from './ImportWizard';

// Step components (for potential reuse)
export { SourceStep } from './SourceStep';
export { PreviewStep } from './PreviewStep';
export { TargetStep } from './TargetStep';
export { MappingStep } from './MappingStep';
export { TransformStep } from './TransformStep';
export { StrategyStep } from './StrategyStep';
export { TriggerStep } from './TriggerStep';
export { ReviewStep } from './ReviewStep';

// Types
export type {
    ImportWizardProps,
    ImportConfiguration,
    SourceConfig,
    FieldMapping,
    ImportStrategies,
    TriggerConfig,
    TransformationStep,
    ParsedData,
    WizardStep,
} from './types';
