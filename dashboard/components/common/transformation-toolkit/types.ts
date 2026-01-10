// =============================================================================
// TYPES
// =============================================================================

export type TransformationType =
    | 'map'
    | 'filter'
    | 'formula'
    | 'merge'
    | 'split'
    | 'aggregate'
    | 'lookup'
    | 'dedupe'
    | 'sort'
    | 'rename'
    | 'typecast';

export interface FieldMapping {
    target: string;
    source: string;
    transform?: string;
}

export interface FilterCondition {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'in' | 'notIn' | 'isNull' | 'isNotNull' | 'regex';
    value: string;
}

export interface FormulaField {
    field: string;
    expression: string;
}

export interface AggregateConfig {
    groupBy: string[];
    aggregations: Array<{
        field: string;
        function: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'first' | 'last' | 'concat';
        alias: string;
    }>;
}

export interface TransformStep {
    id: string;
    type: TransformationType;
    name: string;
    enabled: boolean;
    config: Record<string, any>;
}

export interface TransformationToolkitProps {
    steps: TransformStep[];
    onChange: (steps: TransformStep[]) => void;
    availableFields?: string[];
    onPreview?: (step: TransformStep) => void;
}

export interface MapConfigProps {
    config: { mappings: FieldMapping[] };
    onChange: (config: any) => void;
    fields: string[];
}

export interface FilterConfigProps {
    config: { conditions: FilterCondition[]; logic: 'AND' | 'OR' };
    onChange: (config: any) => void;
    fields: string[];
}

export interface FormulaConfigProps {
    config: { formulas: FormulaField[] };
    onChange: (config: any) => void;
    fields: string[];
}

export interface AggregateConfigProps {
    config: AggregateConfig;
    onChange: (config: any) => void;
    fields: string[];
}

export interface StepEditorProps {
    step: TransformStep;
    onChange: (step: TransformStep) => void;
    fields: string[];
}
