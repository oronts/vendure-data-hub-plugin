/**
 * String Case Conversion Utilities
 *
 * Shared helpers for converting between SCREAMING_SNAKE_CASE and kebab-case.
 * Used by backend resolvers, loader registries, and frontend hooks.
 */

/**
 * Convert SCREAMING_SNAKE_CASE to kebab-case.
 * E.g., PRODUCT_VARIANT -> product-variant
 *
 * @remarks Assumes well-formed enum values (no consecutive or trailing delimiters)
 */
export function screamingSnakeToKebab(value: string): string {
    return value.toLowerCase().replace(/_/g, '-');
}

/**
 * Convert kebab-case to SCREAMING_SNAKE_CASE.
 * E.g., product-variant -> PRODUCT_VARIANT
 */
export function kebabToScreamingSnake(value: string): string {
    return value.toUpperCase().replace(/-/g, '_');
}
