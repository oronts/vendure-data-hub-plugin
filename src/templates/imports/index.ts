export * from './types';
export * from './product-templates';
export * from './customer-templates';
export * from './inventory-templates';
export * from './catalog-templates';
export * from './promotion-templates';

import {
    ImportTemplate,
    TemplateCategory,
    TemplateDifficulty,
    TemplateTag,
    TemplateCategoryInfo,
    CATEGORY_LABELS,
    CATEGORY_DESCRIPTIONS,
    CATEGORY_ICONS,
} from './types';
import { productTemplates } from './product-templates';
import { customerTemplates } from './customer-templates';
import { inventoryTemplates } from './inventory-templates';
import { catalogTemplates } from './catalog-templates';
import { promotionTemplates } from './promotion-templates';

/**
 * Get all available import templates
 */
export function getImportTemplates(): ImportTemplate[] {
    const templates = [
        ...productTemplates,
        ...customerTemplates,
        ...inventoryTemplates,
        ...catalogTemplates,
        ...promotionTemplates,
    ];

    // Sort by featured first, then by sortOrder, then by name
    return templates.sort((a, b) => {
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        if ((a.sortOrder ?? 100) !== (b.sortOrder ?? 100)) {
            return (a.sortOrder ?? 100) - (b.sortOrder ?? 100);
        }
        return a.name.localeCompare(b.name);
    });
}

/**
 * Get templates filtered by category
 */
export function getTemplatesByCategory(category: TemplateCategory): ImportTemplate[] {
    return getImportTemplates().filter(t => t.category === category);
}

/**
 * Get a single template by ID
 */
export function getTemplateById(id: string): ImportTemplate | undefined {
    return getImportTemplates().find(t => t.id === id);
}

/**
 * Get templates filtered by difficulty level
 */
export function getTemplatesByDifficulty(difficulty: TemplateDifficulty): ImportTemplate[] {
    return getImportTemplates().filter(t => t.difficulty === difficulty);
}

/**
 * Get templates filtered by tag
 */
export function getTemplatesByTag(tag: TemplateTag): ImportTemplate[] {
    return getImportTemplates().filter(t => t.tags?.includes(tag));
}

/**
 * Get featured templates
 */
export function getFeaturedTemplates(): ImportTemplate[] {
    return getImportTemplates().filter(t => t.featured);
}

/**
 * Search templates by name or description
 */
export function searchTemplates(query: string): ImportTemplate[] {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return getImportTemplates();

    return getImportTemplates().filter(t =>
        t.name.toLowerCase().includes(normalizedQuery) ||
        t.description.toLowerCase().includes(normalizedQuery) ||
        t.requiredFields.some(f => f.toLowerCase().includes(normalizedQuery)) ||
        t.tags?.some(tag => tag.toLowerCase().includes(normalizedQuery)),
    );
}

/**
 * Get category statistics
 */
export function getTemplateCategories(): Array<TemplateCategoryInfo & { count: number }> {
    const templates = getImportTemplates();
    const counts = new Map<TemplateCategory, number>();

    for (const template of templates) {
        counts.set(template.category, (counts.get(template.category) || 0) + 1);
    }

    const categories: TemplateCategory[] = ['products', 'customers', 'inventory', 'catalog', 'promotions', 'orders'];

    return categories
        .filter(category => counts.has(category))
        .map(category => ({
            category,
            count: counts.get(category) ?? 0,
            label: CATEGORY_LABELS[category],
            description: CATEGORY_DESCRIPTIONS[category],
            icon: CATEGORY_ICONS[category],
        }));
}

/**
 * Get all unique tags from templates
 */
export function getTemplateTags(): TemplateTag[] {
    const tags = new Set<TemplateTag>();
    for (const template of getImportTemplates()) {
        template.tags?.forEach(tag => tags.add(tag));
    }
    return Array.from(tags).sort();
}

/**
 * Get template count
 */
export function getTemplateCount(): number {
    return getImportTemplates().length;
}

/**
 * Validate that a template definition is complete
 */
export function validateTemplate(template: ImportTemplate): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!template.id) errors.push('Template ID is required');
    if (!template.name) errors.push('Template name is required');
    if (!template.description) errors.push('Template description is required');
    if (!template.category) errors.push('Template category is required');
    if (!template.difficulty) errors.push('Template difficulty is required');
    if (!template.requiredFields || template.requiredFields.length === 0) {
        errors.push('At least one required field must be specified');
    }
    if (!template.definition) errors.push('Template definition is required');
    if (!template.definition.target?.entity) errors.push('Target entity is required');

    return { valid: errors.length === 0, errors };
}
