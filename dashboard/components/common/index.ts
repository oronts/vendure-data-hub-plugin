/**
 * Common Components
 * Shared UI components used across multiple features
 */

// File Upload & Mapping
export { FileUploadMapper } from './file-upload-mapper';
export type {
    FileUploadMapperProps,
    ParsedFile,
    ParsedColumn,
    FieldMapping,
    SchemaField,
} from './file-upload-mapper';

// Transformation Toolkit
export { TransformationToolkit } from './transformation-toolkit';
export type {
    TransformationToolkitProps,
    TransformStep,
    TransformationType,
    FilterCondition,
    FormulaField,
    AggregateConfig,
} from './transformation-toolkit';

// Import/Export Wizards - Re-exported from wizards folder
export { ImportWizard } from '../wizards/import-wizard';
export type { ImportWizardProps, ImportConfiguration } from '../wizards/import-wizard';
export { ExportWizard } from '../wizards/export-wizard';
export type { ExportWizardProps, ExportConfiguration } from '../wizards/export-wizard';

// Connection Config Editor
export { ConnectionConfigEditor } from './connection-config-editor';

// Schema Form Renderer
export { SchemaFormRenderer } from './schema-form-renderer';
export type {
    SchemaFormRendererProps,
    SchemaField as FormSchemaField,
    SchemaFieldOption,
    SchemaFieldDependency,
} from './schema-form-renderer';

// JSON Textarea Component
export { JsonTextarea, InlineJsonTextarea } from './json-textarea';
export type { JsonTextareaProps, InlineJsonTextareaProps } from './json-textarea';
