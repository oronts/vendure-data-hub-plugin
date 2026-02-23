import { Injectable, Inject } from '@nestjs/common';
import { DATAHUB_PLUGIN_OPTIONS } from '../../constants';
import type { DataHubPluginOptions, CustomImportTemplate, CustomExportTemplate } from '../../types/plugin-options';
import { getImportTemplates, getTemplateCategories } from '../../templates/imports';
import type { ImportTemplate } from '../../templates/imports/types';

const OPERATION_TO_WIZARD: Record<string, string> = {
    CREATE: 'SKIP',
    UPDATE: 'UPDATE',
    UPSERT: 'UPDATE',
    MERGE: 'UPDATE',
    DELETE: 'SKIP',
};

const SOURCE_TYPE_MAP: Record<string, string> = {
    FILE_UPLOAD: 'FILE',
    HTTP_API: 'API',
    WEBHOOK: 'WEBHOOK',
    GRAPHQL: 'API',
    DATABASE: 'API',
    FTP: 'FILE',
    S3: 'FILE',
    VENDURE_QUERY: 'API',
    CDC: 'API',
};

function toWizardDefinition(template: ImportTemplate): CustomImportTemplate['definition'] {
    const def = template.definition;
    if (!def) return undefined;

    const sourceType = SOURCE_TYPE_MAP[def.source?.type ?? ''] ?? 'FILE';
    const fileFormat = def.source?.format?.format ?? 'CSV';
    const targetEntity = def.target?.entity;
    const existingRecords = OPERATION_TO_WIZARD[def.target?.operation ?? ''] ?? 'UPDATE';
    const lookupFields = def.target?.lookupFields;
    const fieldMappings = def.mappings?.map(m => ({
        sourceField: m.source,
        targetField: m.target,
    }));

    return {
        sourceType,
        fileFormat,
        targetEntity,
        existingRecords,
        lookupFields,
        fieldMappings,
    };
}

function builtinToCustom(template: ImportTemplate): CustomImportTemplate {
    return {
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        icon: template.icon,
        requiredFields: template.requiredFields,
        optionalFields: template.optionalFields,
        sampleData: template.sampleData,
        featured: template.featured,
        tags: template.tags,
        formats: template.formats?.map(f => f.toUpperCase()),
        definition: toWizardDefinition(template),
    };
}

export interface TemplateCategoryResult {
    category: string;
    label: string;
    description: string;
    icon: string;
    count: number;
}

@Injectable()
export class TemplateRegistryService {
    private readonly customImportTemplates: CustomImportTemplate[] = [];
    private readonly customExportTemplates: CustomExportTemplate[] = [];

    constructor(
        @Inject(DATAHUB_PLUGIN_OPTIONS) private readonly options: DataHubPluginOptions,
    ) {
        if (this.options.importTemplates) {
            this.customImportTemplates.push(...this.options.importTemplates);
        }
        if (this.options.exportTemplates) {
            this.customExportTemplates.push(...this.options.exportTemplates);
        }

        if (this.options.connectors) {
            for (const { definition } of this.options.connectors) {
                if (definition.importTemplates) {
                    for (const template of definition.importTemplates) {
                        this.registerImportTemplate(template as CustomImportTemplate);
                    }
                }
                if (definition.exportTemplates) {
                    for (const template of definition.exportTemplates) {
                        this.registerExportTemplate(template as CustomExportTemplate);
                    }
                }
            }
        }
    }

    /**
     * Register a custom import template.
     * If a template with the same id already exists, it is replaced.
     */
    registerImportTemplate(template: CustomImportTemplate): void {
        const existing = this.customImportTemplates.findIndex(t => t.id === template.id);
        if (existing >= 0) {
            this.customImportTemplates[existing] = template;
        } else {
            this.customImportTemplates.push(template);
        }
    }

    /**
     * Register a custom export template.
     * If a template with the same id already exists, it is replaced.
     */
    registerExportTemplate(template: CustomExportTemplate): void {
        const existing = this.customExportTemplates.findIndex(t => t.id === template.id);
        if (existing >= 0) {
            this.customExportTemplates[existing] = template;
        } else {
            this.customExportTemplates.push(template);
        }
    }

    /** Returns built-in import templates (converted to wizard format) merged with custom templates */
    getImportTemplates(): CustomImportTemplate[] {
        const builtIn = getImportTemplates().map(builtinToCustom);
        const all = [...builtIn];
        for (const custom of this.customImportTemplates) {
            const idx = all.findIndex(t => t.id === custom.id);
            if (idx >= 0) {
                all[idx] = custom;
            } else {
                all.push(custom);
            }
        }
        return all;
    }

    /** Returns built-in export templates merged with custom templates */
    getExportTemplates(): CustomExportTemplate[] {
        const builtIn = BUILTIN_EXPORT_TEMPLATES;
        const all = [...builtIn];
        for (const custom of this.customExportTemplates) {
            const idx = all.findIndex(t => t.id === custom.id);
            if (idx >= 0) {
                all[idx] = custom;
            } else {
                all.push(custom);
            }
        }
        return all;
    }

    /** Returns category metadata with template counts */
    getImportTemplateCategories(): TemplateCategoryResult[] {
        return getTemplateCategories();
    }
}

/**
 * All built-in export templates shipped with the plugin.
 * This is the single source of truth for export templates.
 * Custom templates are registered separately via plugin options or connectors.
 */
const BUILTIN_EXPORT_TEMPLATES: CustomExportTemplate[] = [
    // --- Marketplace feed templates ---
    {
        id: 'GOOGLE_SHOPPING',
        name: 'Google Merchant Center',
        description: 'Google Shopping product feed with required attributes for Merchant Center listings',
        format: 'XML',
        requiredFields: ['id', 'title', 'description', 'link', 'image_link', 'price', 'availability'],
        tags: ['feed', 'google', 'shopping'],
        definition: {
            sourceEntity: 'Product',
            fields: ['id', 'name', 'description', 'slug', 'featuredAsset', 'price'],
            formatOptions: { feedFormat: 'GOOGLE_SHOPPING' },
        },
    },
    {
        id: 'META_CATALOG',
        name: 'Meta (Facebook) Catalog',
        description: 'Facebook/Instagram product catalog feed for dynamic ads and shops',
        format: 'CSV',
        requiredFields: ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand'],
        tags: ['feed', 'meta', 'facebook'],
        definition: {
            sourceEntity: 'Product',
            fields: ['id', 'name', 'description', 'price', 'slug', 'featuredAsset'],
            formatOptions: { feedFormat: 'META_CATALOG' },
        },
    },
    {
        id: 'AMAZON',
        name: 'Amazon Product Feed',
        description: 'Amazon marketplace product feed with inventory and pricing data',
        format: 'XML',
        requiredFields: ['sku', 'product-id', 'title', 'description', 'price', 'quantity'],
        tags: ['feed', 'amazon', 'marketplace'],
        definition: {
            sourceEntity: 'Product',
            fields: ['sku', 'id', 'name', 'description', 'price'],
            formatOptions: { feedFormat: 'AMAZON' },
        },
    },
    // --- Product export templates ---
    {
        id: 'product-xml-feed',
        name: 'Product XML Feed',
        description: 'Export product catalog as XML feed for marketplace listings, comparison engines, or partner integrations.',
        icon: 'file-code',
        format: 'XML',
        tags: ['products', 'feed', 'xml', 'marketplace'],
        definition: {
            sourceEntity: 'Product',
            formatOptions: { xmlRoot: 'products', xmlItem: 'product' },
        },
    },
    {
        id: 'product-csv-export',
        name: 'Product Catalog (CSV)',
        description: 'Export full product catalog with variants, pricing, and attributes to CSV',
        format: 'CSV',
        requiredFields: [],
        tags: ['products', 'catalog'],
        definition: {
            sourceEntity: 'Product',
            formatOptions: { delimiter: ',', includeHeaders: true },
        },
    },
    {
        id: 'product-json-export',
        name: 'Product Catalog (JSON)',
        description: 'Export product catalog as structured JSON for API integrations and headless frontends',
        format: 'JSON',
        requiredFields: [],
        tags: ['products', 'api', 'integration'],
        definition: {
            sourceEntity: 'Product',
            formatOptions: { pretty: true },
        },
    },
    // --- Order export templates ---
    {
        id: 'order-analytics-csv',
        name: 'Order Analytics Export',
        description: 'Export order data with line items, totals, and customer info for business intelligence and reporting.',
        icon: 'bar-chart',
        format: 'CSV',
        requiredFields: ['id', 'code', 'total', 'createdAt'],
        tags: ['orders', 'analytics', 'reporting', 'csv'],
        definition: {
            sourceEntity: 'Order',
            formatOptions: { delimiter: ',', includeHeaders: true },
        },
    },
    {
        id: 'order-csv-export',
        name: 'Order Export (CSV)',
        description: 'Export order data with line items and totals for reporting and analytics',
        format: 'CSV',
        requiredFields: [],
        tags: ['orders', 'reporting'],
        definition: {
            sourceEntity: 'Order',
            formatOptions: { delimiter: ',', includeHeaders: true },
        },
    },
    // --- Customer export templates ---
    {
        id: 'customer-export-gdpr',
        name: 'Customer Data Export (GDPR)',
        description: 'Export customer personal data for GDPR data portability requests. Includes all PII fields.',
        icon: 'shield',
        format: 'JSON',
        tags: ['customers', 'gdpr', 'compliance', 'privacy'],
        definition: {
            sourceEntity: 'Customer',
            formatOptions: { pretty: true },
        },
    },
    {
        id: 'customer-csv-export',
        name: 'Customer Export (CSV)',
        description: 'Export customer data with email, name, and addresses to CSV',
        format: 'CSV',
        requiredFields: [],
        tags: ['customers'],
        definition: {
            sourceEntity: 'Customer',
            formatOptions: { delimiter: ',', includeHeaders: true },
        },
    },
    // --- Inventory export templates ---
    {
        id: 'inventory-report-csv',
        name: 'Inventory Reconciliation Report',
        description: 'Export current stock levels across all locations for warehouse reconciliation and audit.',
        icon: 'clipboard-list',
        format: 'CSV',
        tags: ['inventory', 'reporting', 'audit'],
        definition: {
            sourceEntity: 'StockLevel',
            formatOptions: { delimiter: ',', includeHeaders: true },
        },
    },
    {
        id: 'inventory-csv-export',
        name: 'Inventory Report (CSV)',
        description: 'Export current stock levels across all locations for inventory reconciliation',
        format: 'CSV',
        requiredFields: [],
        tags: ['inventory', 'reporting'],
        definition: {
            sourceEntity: 'StockLevel',
            formatOptions: { delimiter: ',', includeHeaders: true },
        },
    },
];
