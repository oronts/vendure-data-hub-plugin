import {
    Database,
    Columns,
    FileSpreadsheet,
    Send,
    Clock,
    Check,
    ShoppingCart,
    Rss,
    FileJson,
    FileText,
} from 'lucide-react';
import type { WizardStep, FeedTemplate } from '../../../types/wizard';

export const EXPORT_STEP_ID = {
    SOURCE: 'source',
    FIELDS: 'fields',
    FORMAT: 'format',
    DESTINATION: 'destination',
    TRIGGER: 'trigger',
    REVIEW: 'review',
} as const;

export {
    EXPORT_FORMAT_TYPES,
    CSV_DELIMITERS,
    FILE_ENCODINGS,
    HTTP_METHODS,
    HTTP_AUTH_TYPES,
    EXPORT_DEFAULTS,
    EXPORT_DESTINATION_TYPES,
} from '../shared';

export type {
    ExportFormatType,
    CsvDelimiter,
    FileEncoding,
    HttpMethod,
    HttpAuthType,
    ExportDestinationType,
} from '../shared';

export const WIZARD_STEPS: WizardStep[] = [
    { id: 'source', label: 'Data Source', icon: Database },
    { id: 'fields', label: 'Select Fields', icon: Columns },
    { id: 'format', label: 'Output Format', icon: FileSpreadsheet },
    { id: 'destination', label: 'Destination', icon: Send },
    { id: 'trigger', label: 'Schedule', icon: Clock },
    { id: 'review', label: 'Review', icon: Check },
];

export const FEED_TEMPLATES: FeedTemplate[] = [
    {
        id: 'GOOGLE_SHOPPING',
        name: 'Google Merchant Center',
        icon: ShoppingCart,
        description: 'Google Shopping product feed',
        format: 'XML',
        requiredFields: ['id', 'title', 'description', 'link', 'image_link', 'price', 'availability'],
    },
    {
        id: 'META_CATALOG',
        name: 'Meta (Facebook) Catalog',
        icon: Rss,
        description: 'Facebook/Instagram product catalog',
        format: 'CSV',
        requiredFields: ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand'],
    },
    {
        id: 'AMAZON',
        name: 'Amazon Product Feed',
        icon: ShoppingCart,
        description: 'Amazon marketplace feed',
        format: 'XML',
        requiredFields: ['sku', 'product-id', 'title', 'description', 'price', 'quantity'],
    },
    {
        id: 'custom-csv',
        name: 'Custom CSV',
        icon: FileSpreadsheet,
        description: 'Custom CSV export',
        format: 'CSV',
        requiredFields: [],
    },
    {
        id: 'custom-json',
        name: 'Custom JSON',
        icon: FileJson,
        description: 'Custom JSON export',
        format: 'JSON',
        requiredFields: [],
    },
    {
        id: 'custom-xml',
        name: 'Custom XML',
        icon: FileText,
        description: 'Custom XML export',
        format: 'XML',
        requiredFields: [],
    },
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

export const PLACEHOLDERS = {
    configName: 'My Product Export',
    filename: 'export-{date}.csv',
    sftpHost: 'sftp.example.com',
    remotePath: '/uploads/feeds',
    httpUrl: 'https://api.example.com/import',
    jsonRoot: 'data',
} as const;
