import type { EnhancedSchemaDefinition, TransformationType } from '../../../types';
import type {
    ImportFieldMapping,
    ImportStrategies,
    ImportSourceConfig,
    ImportTriggerConfig,
    WizardTransformationStep,
} from '../../../types/wizard';

export type SourceType = ImportSourceConfig['type'];
export type FileFormat = NonNullable<ImportSourceConfig['fileConfig']>['format'];
export type ApiMethod = NonNullable<ImportSourceConfig['apiConfig']>['method'];

export interface ImportWizardProps {
    onComplete: (config: ImportConfiguration) => void;
    onCancel: () => void;
    initialConfig?: Partial<ImportConfiguration>;
    isSubmitting?: boolean;
}

export interface ImportConfiguration {
    name: string;
    description?: string;
    source: ImportSourceConfig;
    targetEntity: string;
    targetSchema?: EnhancedSchemaDefinition;
    mappings: ImportFieldMapping[];
    strategies: ImportStrategies;
    trigger: ImportTriggerConfig;
    transformations: WizardTransformationStep[];
}

export type { ImportFieldMapping as FieldMapping };
export type { ImportStrategies };
export type { TransformationType };
