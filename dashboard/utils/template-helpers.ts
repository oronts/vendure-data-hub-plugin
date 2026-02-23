/**
 * Shared helper functions for import/export template hooks.
 * Eliminates duplication between use-import-templates.ts and use-export-templates.ts.
 */

interface Identifiable {
    id: string;
    name: string;
    description: string;
    requiredFields: string[];
    tags?: string[];
}

/**
 * Search templates by name, description, requiredFields, and tags.
 */
export function filterTemplates<T extends Identifiable>(templates: T[], query: string): T[] {
    if (!query.trim()) return templates;
    const q = query.toLowerCase();
    return templates.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.requiredFields?.some(f => f.toLowerCase().includes(q)) ||
        t.tags?.some(tag => tag.toLowerCase().includes(q)),
    );
}
