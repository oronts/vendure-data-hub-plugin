/**
 * Export Wizard Constants
 * Shared constants used across export wizard components
 */

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
import type { WizardStep, FeedTemplate } from './types';

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
        id: 'google-merchant',
        name: 'Google Merchant Center',
        icon: ShoppingCart,
        description: 'Google Shopping product feed',
        format: 'xml',
        requiredFields: ['id', 'title', 'description', 'link', 'image_link', 'price', 'availability'],
    },
    {
        id: 'meta-catalog',
        name: 'Meta (Facebook) Catalog',
        icon: Rss,
        description: 'Facebook/Instagram product catalog',
        format: 'csv',
        requiredFields: ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand'],
    },
    {
        id: 'amazon-feed',
        name: 'Amazon Product Feed',
        icon: ShoppingCart,
        description: 'Amazon marketplace feed',
        format: 'xml',
        requiredFields: ['sku', 'product-id', 'title', 'description', 'price', 'quantity'],
    },
    {
        id: 'custom-csv',
        name: 'Custom CSV',
        icon: FileSpreadsheet,
        description: 'Custom CSV export',
        format: 'csv',
        requiredFields: [],
    },
    {
        id: 'custom-json',
        name: 'Custom JSON',
        icon: FileJson,
        description: 'Custom JSON export',
        format: 'json',
        requiredFields: [],
    },
    {
        id: 'custom-xml',
        name: 'Custom XML',
        icon: FileText,
        description: 'Custom XML export',
        format: 'xml',
        requiredFields: [],
    },
];

export const SCHEDULE_PRESETS = [
    { label: 'Every hour', cron: '0 * * * *' },
    { label: 'Every 6 hours', cron: '0 */6 * * *' },
    { label: 'Daily at midnight', cron: '0 0 * * *' },
    { label: 'Daily at 6 AM', cron: '0 6 * * *' },
    { label: 'Weekly (Sunday)', cron: '0 0 * * 0' },
];
