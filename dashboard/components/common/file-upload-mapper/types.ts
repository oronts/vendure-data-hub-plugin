import type { JsonObject, FileType, ParsedColumn, ParsedFile, UIFieldMapping, SourceField, TargetField } from '../../../types';

export type { ParsedColumn, ParsedFile, UIFieldMapping, SourceField, TargetField };

export type MappingTargetField = TargetField;

export interface FileUploadMapperProps {
    targetSchema?: MappingTargetField[];
    onMappingComplete: (mappings: UIFieldMapping[], data: JsonObject[]) => void;
    onCancel?: () => void;
    allowedTypes?: FileType[];
}

export interface DataPreviewProps {
    data: JsonObject[];
    columns: ParsedColumn[];
    maxRows?: number;
}

export interface FieldMappingEditorProps {
    sourceColumns: ParsedColumn[];
    targetSchema: MappingTargetField[];
    mappings: UIFieldMapping[];
    onChange: (mappings: UIFieldMapping[]) => void;
}

export interface ColumnStatsProps {
    columns: ParsedColumn[];
    rowCount: number;
}
