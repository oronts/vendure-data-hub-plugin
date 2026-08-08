/**
 * Pipeline definition validation limits.
 */
export const PIPELINE_DEFINITION_LIMITS = {
    /** Maximum UTF-8 size of a serialized definition. */
    MAX_BYTES: 1_048_576,
    /** Maximum nested object/array depth, including the definition root. */
    MAX_DEPTH: 32,
} as const;
