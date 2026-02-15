/**
 * Template Type Definitions (shared)
 *
 * Canonical source for template-related types used by both
 * src/ (backend templates) and dashboard/ (UI components).
 */

/** Template categories for grouping import templates */
export type TemplateCategory =
    | 'products'
    | 'customers'
    | 'inventory'
    | 'orders'
    | 'promotions'
    | 'catalog';

/** Template difficulty levels */
export type TemplateDifficulty = 'beginner' | 'intermediate' | 'advanced';
