/**
 * Transform adapter codes for operator/transform steps
 * Codes are camelCase to match operator codes in src/operators/
 */
export const TRANSFORM_ADAPTER_CODE = {
    MAP: 'map',
    TEMPLATE: 'template',
    FILTER: 'filter',
    SCRIPT: 'script',
} as const;

type TransformAdapterCode = typeof TRANSFORM_ADAPTER_CODE[keyof typeof TRANSFORM_ADAPTER_CODE];
