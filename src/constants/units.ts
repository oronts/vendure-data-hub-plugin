export const WEIGHT_UNITS = {
    GRAM: 'g',
    KILOGRAM: 'kg',
    POUND: 'lb',
    OUNCE: 'oz',
} as const;

export type WeightUnit = typeof WEIGHT_UNITS[keyof typeof WEIGHT_UNITS];

/**
 * Length unit identifiers
 */
export const LENGTH_UNITS = {
    MILLIMETER: 'mm',
    CENTIMETER: 'cm',
    METER: 'm',
    INCH: 'in',
    FOOT: 'ft',
} as const;

export type LengthUnit = typeof LENGTH_UNITS[keyof typeof LENGTH_UNITS];

/**
 * Volume unit identifiers
 */
export const VOLUME_UNITS = {
    MILLILITER: 'ml',
    LITER: 'l',
    GALLON: 'gal',
} as const;

export type VolumeUnit = typeof VOLUME_UNITS[keyof typeof VOLUME_UNITS];

/**
 * Unit conversion factors
 * Maps from source unit to target unit with multiplier
 */
export const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
    // Weight conversions (base: grams)
    g: { g: 1, kg: 0.001, lb: 0.00220462, oz: 0.035274 },
    kg: { g: 1000, kg: 1, lb: 2.20462, oz: 35.274 },
    lb: { g: 453.592, kg: 0.453592, lb: 1, oz: 16 },
    oz: { g: 28.3495, kg: 0.0283495, lb: 0.0625, oz: 1 },

    // Length conversions (base: centimeters)
    mm: { mm: 1, cm: 0.1, m: 0.001, in: 0.0393701, ft: 0.00328084 },
    cm: { mm: 10, cm: 1, m: 0.01, in: 0.393701, ft: 0.0328084 },
    m: { mm: 1000, cm: 100, m: 1, in: 39.3701, ft: 3.28084 },
    in: { mm: 25.4, cm: 2.54, m: 0.0254, in: 1, ft: 0.0833333 },
    ft: { mm: 304.8, cm: 30.48, m: 0.3048, in: 12, ft: 1 },

    // Volume conversions (base: milliliters)
    ml: { ml: 1, l: 0.001, gal: 0.000264172 },
    l: { ml: 1000, l: 1, gal: 0.264172 },
    gal: { ml: 3785.41, l: 3.78541, gal: 1 },
} as const;

/**
 * Convert a value between units
 * @param value - Value to convert
 * @param fromUnit - Source unit
 * @param toUnit - Target unit
 * @returns Converted value or null if conversion not supported
 */
export function convertUnit(
    value: number,
    fromUnit: string,
    toUnit: string,
): number | null {
    const conversions = UNIT_CONVERSIONS[fromUnit.toLowerCase()];
    if (!conversions) return null;

    const factor = conversions[toUnit.toLowerCase()];
    if (factor === undefined) return null;

    return value * factor;
}

