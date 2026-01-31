/**
 * Shared constants for import/export wizards
 * Consolidates common options and configurations
 */

import {
    Upload,
    Globe,
    Database,
    Webhook,
    FileSpreadsheet,
    FileJson,
    FileText,
    type LucideIcon,
} from 'lucide-react';

export {
    IMPORT_SOURCE_TYPES,
    IMPORT_FILE_FORMATS,
    EXPORT_FORMAT_TYPES,
    CSV_DELIMITERS,
    FILE_ENCODINGS,
    HTTP_METHODS,
    HTTP_AUTH_TYPES,
    EXPORT_DEFAULTS,
    EXISTING_RECORDS_STRATEGIES,
    NEW_RECORDS_STRATEGIES,
    EXPORT_DESTINATION_TYPES,
    FILE_FORMAT,
    SOURCE_TYPE,
    DESTINATION_TYPE,
    EXPORT_FORMAT,
    CLEANUP_STRATEGIES,
    CLEANUP_STRATEGY,
    COMPRESSION_OPTIONS,
    COMPRESSION_TYPE,
    XML_DEFAULTS,
    DEFAULT_ENCODING,
} from '../../../constants/wizard-options';

export type {
    ImportSourceType,
    ImportFileFormat,
    ExportFormatType,
    CsvDelimiter,
    FileEncoding,
    HttpMethod,
    HttpAuthType,
    ExistingRecordsStrategy,
    NewRecordsStrategy,
    ExportDestinationType,
    CleanupStrategy,
    CompressionType,
} from '../../../constants/wizard-options';

export {
    CRON_PRESETS,
    IMPORT_WIZARD_TRIGGERS,
    EXPORT_WIZARD_TRIGGERS,
    TRIGGER_ICONS,
    TIMEZONES,
} from '../../../constants/triggers';

export type {
    CronPreset,
    WizardTriggerOption,
} from '../../../constants/triggers';

/**
 * Icon mappings for source types
 */
export const SOURCE_TYPE_ICONS: Record<string, LucideIcon> = {
    file: Upload,
    api: Globe,
    database: Database,
    webhook: Webhook,
};

/**
 * Icon mappings for file formats
 */
export const FILE_FORMAT_ICONS: Record<string, LucideIcon> = {
    csv: FileSpreadsheet,
    xlsx: FileSpreadsheet,
    json: FileJson,
    xml: FileText,
};

/**
 * Common wizard step content structure
 */
export interface WizardStepContent {
    title: string;
    description?: string;
    emptyTitle?: string;
    emptyDescription?: string;
    cardTitle?: string;
}

/**
 * Common placeholder structure
 */
export interface WizardPlaceholders {
    configName: string;
    [key: string]: string;
}

/**
 * Transformation type options for import wizard.
 * IDs match TransformationType from shared/types/transform.types.ts (camelCase).
 * All 15 backend transformation types are represented here.
 */
export const TRANSFORM_TYPES = [
    { id: 'map', label: 'Map', description: 'Transform field values with expressions' },
    { id: 'rename', label: 'Rename', description: 'Rename field keys' },
    { id: 'filter', label: 'Filter', description: 'Filter out rows based on conditions' },
    { id: 'lookup', label: 'Lookup', description: 'Enrich data from lookup tables' },
    { id: 'formula', label: 'Formula', description: 'Calculate new field values' },
    { id: 'validate', label: 'Validate', description: 'Validate data against rules' },
    { id: 'split', label: 'Split', description: 'Split field into multiple values' },
    { id: 'merge', label: 'Merge', description: 'Combine multiple fields into one' },
    { id: 'aggregate', label: 'Aggregate', description: 'Group and aggregate records' },
    { id: 'dedupe', label: 'Dedupe', description: 'Remove duplicate records' },
    { id: 'sort', label: 'Sort', description: 'Sort records by field' },
    { id: 'template', label: 'Template', description: 'Generate fields using templates' },
    { id: 'typecast', label: 'Type Cast', description: 'Convert field data types' },
    { id: 'enrich', label: 'Enrich', description: 'Add or enhance data fields' },
    { id: 'script', label: 'Script', description: 'Execute custom transformation script' },
] as const;

export type TransformTypeId = typeof TRANSFORM_TYPES[number]['id'];
