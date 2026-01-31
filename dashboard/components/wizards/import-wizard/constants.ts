import {
    Database,
    Eye,
    Table,
    Columns,
    Zap,
    Settings,
    Clock,
    Check,
} from 'lucide-react';
import type { WizardStep } from '../../../types/wizard';

export const IMPORT_STEP_ID = {
    SOURCE: 'source',
    PREVIEW: 'preview',
    TARGET: 'target',
    MAPPING: 'mapping',
    TRANSFORM: 'transform',
    STRATEGY: 'strategy',
    TRIGGER: 'trigger',
    REVIEW: 'review',
} as const;

export {
    IMPORT_SOURCE_TYPES as SOURCE_TYPES,
    IMPORT_FILE_FORMATS as FILE_FORMATS,
    TRANSFORM_TYPES,
    SOURCE_TYPE_ICONS,
    FILE_FORMAT_ICONS,
} from '../shared';

export type {
    ImportSourceType as SourceTypeId,
    ImportFileFormat as FileFormatId,
    TransformTypeId,
} from '../shared';

export const WIZARD_STEPS: WizardStep[] = [
    { id: 'source', label: 'Data Source', icon: Database },
    { id: 'preview', label: 'Preview Data', icon: Eye },
    { id: 'target', label: 'Target Entity', icon: Table },
    { id: 'mapping', label: 'Field Mapping', icon: Columns },
    { id: 'transform', label: 'Transformations', icon: Zap },
    { id: 'strategy', label: 'Import Strategy', icon: Settings },
    { id: 'trigger', label: 'Trigger & Schedule', icon: Clock },
    { id: 'review', label: 'Review & Create', icon: Check },
];

export const STEP_CONTENT = {
    source: {
        title: 'Select Data Source',
        description: 'Choose where your data will come from',
    },
    preview: {
        title: 'Data Preview',
        emptyTitle: 'No data to preview',
        emptyDescription: 'Please upload a file first.',
    },
    target: {
        title: 'Select Target Entity',
        description: 'Choose which Vendure entity to import data into',
    },
    mapping: {
        title: 'Field Mapping',
        description: 'Map source fields to target entity fields',
    },
    transform: {
        title: 'Data Transformations',
        description: 'Add transformations to process data before import (optional)',
        emptyTitle: 'No transformations added',
        emptyDescription: 'Click a transformation type above to add it to the pipeline',
    },
    strategy: {
        title: 'Import Strategy',
        description: 'Configure how to handle existing and new records',
    },
    trigger: {
        title: 'Trigger & Schedule',
        description: 'Configure when and how the import should run',
    },
    review: {
        title: 'Review & Create',
        description: 'Review your import configuration before creating',
        cardTitle: 'Import Configuration',
    },
} as const;

export const PLACEHOLDERS = {
    apiUrl: 'https://api.example.com/data',
    configName: 'My Product Import',
} as const;
