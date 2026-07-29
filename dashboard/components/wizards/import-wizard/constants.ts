import {
    Database,
    Eye,
    Table,
    Columns,
    Zap,
    Settings,
    Clock,
    Check,
    LayoutTemplate,
} from 'lucide-react';
import type { WizardStep, ImportStrategies } from '../../../types/wizard';
import { BATCH_SIZES } from '../../../constants';

export const IMPORT_STEP_ID = {
    TEMPLATE: 'template',
    SOURCE: 'source',
    PREVIEW: 'preview',
    TARGET: 'target',
    MAPPING: 'mapping',
    TRANSFORM: 'transform',
    STRATEGY: 'strategy',
    TRIGGER: 'trigger',
    REVIEW: 'review',
} as const;

export type {
    TransformTypeOption,
} from '../shared';

export const WIZARD_STEPS: WizardStep[] = [
    { id: 'template', label: 'Template', icon: LayoutTemplate },
    { id: 'source', label: 'Source', icon: Database },
    { id: 'preview', label: 'Preview', icon: Eye },
    { id: 'target', label: 'Target', icon: Table },
    { id: 'mapping', label: 'Mapping', icon: Columns },
    { id: 'transform', label: 'Transform', icon: Zap },
    { id: 'strategy', label: 'Strategy', icon: Settings },
    { id: 'trigger', label: 'Trigger', icon: Clock },
    { id: 'review', label: 'Review', icon: Check },
];

/** Steps to show when using a template (skips template selection) */
export const WIZARD_STEPS_FROM_TEMPLATE: WizardStep[] = WIZARD_STEPS.slice(1);

export const IMPORT_PLACEHOLDERS = {
    apiUrl: 'https://api.example.com/data',
    jsonItemsPath: 'data.items',
    xmlRecordPath: 'catalog.product',
    xmlAttributePrefix: '@',
    xlsxSheet: 'Sheet1 or 0',
} as const;

export const DEFAULT_IMPORT_STRATEGIES: ImportStrategies = {
    existingRecords: 'UPDATE',
    lookupFields: [],
    batchSize: BATCH_SIZES.IMPORT_DEFAULT,
    parallelBatches: 1,
    continueOnError: true,
};
