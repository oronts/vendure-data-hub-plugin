// =============================================================================
// TYPES
// =============================================================================

export interface ParsedColumn {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'unknown';
    sampleValues: any[];
    nullCount: number;
    uniqueCount: number;
}

export interface ParsedFile {
    fileName: string;
    fileType: 'csv' | 'excel' | 'json';
    rowCount: number;
    columns: ParsedColumn[];
    preview: Record<string, any>[];
    rawData: Record<string, any>[];
}

export interface FieldMapping {
    sourceField: string;
    targetField: string;
    transform?: string;
    defaultValue?: any;
}

export interface SchemaField {
    name: string;
    type: string;
    required?: boolean;
    description?: string;
}

export interface FileUploadMapperProps {
    targetSchema?: SchemaField[];
    onMappingComplete: (mappings: FieldMapping[], data: Record<string, any>[]) => void;
    onCancel?: () => void;
    allowedTypes?: ('csv' | 'excel' | 'json')[];
}

export interface FileUploadZoneProps {
    onFileSelect: (file: File) => void;
    allowedTypes: ('csv' | 'excel' | 'json')[];
    loading?: boolean;
}

export interface DataPreviewProps {
    data: Record<string, any>[];
    columns: ParsedColumn[];
    maxRows?: number;
}

export interface FieldMappingEditorProps {
    sourceColumns: ParsedColumn[];
    targetSchema: SchemaField[];
    mappings: FieldMapping[];
    onChange: (mappings: FieldMapping[]) => void;
}

export interface ColumnStatsProps {
    columns: ParsedColumn[];
    rowCount: number;
}
