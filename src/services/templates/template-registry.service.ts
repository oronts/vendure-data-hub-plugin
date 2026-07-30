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
    // --- Product export templates ---
    {
        id: 'product-xml-feed',
        name: 'Product XML Feed',
        description: 'Export product records and translated catalog fields as XML for partner integrations.',
        icon: 'file-code',
        format: 'XML',
        tags: ['products', 'feed', 'xml', 'marketplace'],
        definition: {
            sourceEntity: 'PRODUCT',
            formatOptions: { xmlRoot: 'products', xmlItem: 'product' },
        },
    },
    {
        id: 'product-csv-export',
        name: 'Product Catalog (CSV)',
        description: 'Export product records and translated catalog fields to CSV',
        format: 'CSV',
        requiredFields: [],
        tags: ['products', 'catalog'],
        definition: {
            sourceEntity: 'PRODUCT',
            formatOptions: { delimiter: ',', includeHeaders: true },
        },
    },
    {
        id: 'product-json-export',
        name: 'Product Catalog (JSON)',
        description: 'Export product records and translated catalog fields as structured JSON',
        format: 'JSON',
        requiredFields: [],
        tags: ['products', 'api', 'integration'],
        definition: {
            sourceEntity: 'PRODUCT',
            formatOptions: { pretty: true },
        },
    },
    // --- Order export templates ---
    {
        id: 'order-analytics-csv',
        name: 'Order Analytics Export',
        description: 'Export core order status, dates, currency, coupon, and address data for reporting.',
        icon: 'bar-chart',
        format: 'CSV',
        requiredFields: ['id', 'code', 'state', 'createdAt'],
        tags: ['orders', 'analytics', 'reporting', 'csv'],
        definition: {
            sourceEntity: 'ORDER',
            formatOptions: { delimiter: ',', includeHeaders: true },
        },
    },
    {
        id: 'order-csv-export',
        name: 'Order Export (CSV)',
        description: 'Export core order status, dates, currency, coupon, and address data to CSV',
        format: 'CSV',
        requiredFields: [],
        tags: ['orders', 'reporting'],
        definition: {
            sourceEntity: 'ORDER',
            formatOptions: { delimiter: ',', includeHeaders: true },
        },
    },
    // --- Customer export templates ---
    {
        id: 'customer-export-gdpr',
        name: 'Customer Data Export (GDPR)',
        description: 'Export the core customer profile fields available to the generic extractor for data portability.',
        icon: 'shield',
        format: 'JSON',
        tags: ['customers', 'gdpr', 'compliance', 'privacy'],
        definition: {
            sourceEntity: 'CUSTOMER',
            formatOptions: { pretty: true },
        },
    },
    {
        id: 'customer-csv-export',
        name: 'Customer Export (CSV)',
        description: 'Export customer contact and account fields to CSV',
        format: 'CSV',
        requiredFields: [],
        tags: ['customers'],
        definition: {
            sourceEntity: 'CUSTOMER',
            formatOptions: { delimiter: ',', includeHeaders: true },
        },
    },
];
