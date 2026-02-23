import {
    Database,
    Columns,
    FileSpreadsheet,
    Send,
    Clock,
    Check,
} from 'lucide-react';
import type { WizardStep, ExportOptions } from '../../../types/wizard';
import { BATCH_SIZES, UI_DEFAULTS, COMPRESSION_TYPE } from '../../../constants';

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

export const STEP_CONTENT = {
    source: {
        title: 'Select Data Source',
        description: 'Choose which Vendure entity to export',
    },
    fields: {
        title: 'Select Fields',
        description: 'Choose which fields to include in the export',
    },
    format: {
        title: 'Output Format',
        description: 'Choose the output format and configure options',
    },
    destination: {
        title: 'Destination',
        description: 'Choose where to deliver the exported data',
    },
    trigger: {
        title: 'Schedule & Options',
        description: 'Configure when to run the export and additional options',
    },
    review: {
        title: 'Review & Create',
        description: 'Review your export configuration before creating',
        cardTitle: 'Export Configuration',
    },
} as const;

export const EXPORT_PLACEHOLDERS = {
    configName: 'My Product Export',
    filename: 'export-{date}.csv',
    sftpHost: 'sftp.example.com',
    remotePath: '/uploads/feeds',
    httpUrl: 'https://api.example.com/import',
} as const;

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
    batchSize: BATCH_SIZES.EXPORT_DEFAULT,
    includeMetadata: false,
    compression: COMPRESSION_TYPE.NONE,
    notifyOnComplete: true,
    retryOnFailure: true,
    maxRetries: UI_DEFAULTS.DEFAULT_MAX_RETRIES,
};
