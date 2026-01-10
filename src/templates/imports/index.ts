export * from './types';
export * from './product-templates';
export * from './customer-templates';
export * from './inventory-templates';
export * from './catalog-templates';
export * from './promotion-templates';

import { ImportTemplate, TemplateCategory, CATEGORY_LABELS } from './types';
import { productTemplates } from './product-templates';
import { customerTemplates } from './customer-templates';
import { inventoryTemplates } from './inventory-templates';
import { catalogTemplates } from './catalog-templates';
import { promotionTemplates } from './promotion-templates';

export function getImportTemplates(): ImportTemplate[] {
    return [
        ...productTemplates,
        ...customerTemplates,
        ...inventoryTemplates,
        ...catalogTemplates,
        ...promotionTemplates,
    ];
}

export function getTemplatesByCategory(category: TemplateCategory): ImportTemplate[] {
    return getImportTemplates().filter(t => t.category === category);
}

export function getTemplateById(id: string): ImportTemplate | undefined {
    return getImportTemplates().find(t => t.id === id);
}

export function getTemplateCategories(): Array<{ category: TemplateCategory; count: number; label: string }> {
    const templates = getImportTemplates();
    const counts = new Map<TemplateCategory, number>();

    for (const template of templates) {
        counts.set(template.category, (counts.get(template.category) || 0) + 1);
    }

    return Array.from(counts.entries()).map(([category, count]) => ({
        category,
        count,
        label: CATEGORY_LABELS[category],
    }));
}
