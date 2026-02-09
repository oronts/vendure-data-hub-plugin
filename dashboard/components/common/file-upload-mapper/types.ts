import type { JsonObject, FileType, ParsedColumn } from '../../../types';
import type { JsonValue } from '../../../../shared/types';

export type { ParsedColumn };

export interface ParsedFile {
    fileName: string;
    fileType: FileType;
    rowCount: number;
    columns: ParsedColumn[];
    preview: JsonObject[];
    rawData: JsonObject[];
    fileId?: string;
}

export interface UIFieldMapping {
    sourceField: string;
    targetField: string;
    transform?: string;
    defaultValue?: JsonValue;
}

export interface SourceField {
    name: string;
    type?: string;
    sampleValues?: JsonValue[];
}

export interface TargetField {
    name: string;
    type?: string;
    required?: boolean;
    description?: string;
}

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
