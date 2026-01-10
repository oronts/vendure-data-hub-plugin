/**
 * Data Hooks
 * Hooks for data parsing, mapping, and transformations
 */

// File parsing hook
export { useFileParser, getFileType } from '../useFileParser';
export type {
    FileType,
    ParsedColumn,
    ParsedFile,
    UseFileParserOptions,
    UseFileParserResult,
} from '../useFileParser';

// Field mapping hook
export { useFieldMapping } from '../useFieldMapping';
export type {
    FieldMapping,
    SourceField,
    TargetField,
    UseFieldMappingOptions,
    UseFieldMappingResult,
} from '../useFieldMapping';
