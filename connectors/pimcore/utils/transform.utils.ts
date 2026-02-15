/**
 * Pimcore Transform Utilities
 *
 * Transformation helpers for Pimcore data conversion.
 */

/**
 * Convert a price value (in major currency units, e.g. dollars) to minor units (cents).
 * Handles string inputs, null/undefined, and non-finite values.
 */
export function priceToCents(price: number | string | null | undefined): number {
    if (price == null) return 0;

    const num = typeof price === 'string' ? parseFloat(price) : price;
    if (!isFinite(num)) return 0;

    return Math.round(num * 100);
}
