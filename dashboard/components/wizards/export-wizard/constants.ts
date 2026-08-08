import {
    Database,
    Columns,
    FileSpreadsheet,
    Send,
    Clock,
    Check,
} from 'lucide-react';
import type { WizardStep, ExportOptions } from '../../../types/wizard';
import {
    BATCH_SIZES,
} from '../../../constants';

export const EXPORT_STEP_ID = {
    SOURCE: 'source',
    FIELDS: 'fields',
    FORMAT: 'format',
    DESTINATION: 'destination',
    TRIGGER: 'trigger',
    REVIEW: 'review',
} as const;

export const WIZARD_STEPS: WizardStep[] = [
    { id: 'source', label: 'Data Source', icon: Database },
    { id: 'fields', label: 'Select Fields', icon: Columns },
    { id: 'format', label: 'Output Format', icon: FileSpreadsheet },
    { id: 'destination', label: 'Destination', icon: Send },
    { id: 'trigger', label: 'Schedule', icon: Clock },
    { id: 'review', label: 'Review', icon: Check },
];

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
    batchSize: BATCH_SIZES.EXPORT_DEFAULT,
};
