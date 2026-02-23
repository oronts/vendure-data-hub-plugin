import { icons, type LucideIcon } from 'lucide-react';

/**
 * Convert a kebab-case icon name to PascalCase for lucide-react lookup.
 * e.g. 'arrow-down' → 'ArrowDown', 'file-text' → 'FileText'
 */
function kebabToPascal(name: string): string {
    return name
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

/**
 * Resolve a backend icon name string (e.g. 'code', 'globe', 'file-text')
 * to a LucideIcon component. Accepts both kebab-case and PascalCase input.
 * Returns undefined if the name is not recognized, allowing callers to provide a fallback.
 *
 * Uses lucide-react's `icons` export for fully dynamic resolution —
 * no manual map needed when new icons are used.
 */
export function resolveIconName(name: string | undefined | null): LucideIcon | undefined {
    if (!name) return undefined;

    // If already PascalCase (no hyphens), try direct lookup first
    if (!name.includes('-')) {
        const pascalName = name.charAt(0).toUpperCase() + name.slice(1);
        const direct = icons[pascalName as keyof typeof icons];
        if (direct) return direct;
    }

    // Convert kebab-case to PascalCase and look up
    const pascalCase = kebabToPascal(name);
    return icons[pascalCase as keyof typeof icons];
}
