/**
 * Re-export connection types from src for external SDK consumers.
 *
 * NOTE: This is an intentional layer bridge — the top-level sdk/ directory
 * provides a stable public API surface for SDK consumers, while the actual
 * implementation lives in src/sdk/. External packages import from here;
 * internal code imports from src/sdk/ directly.
 */
export * from '../../src/sdk/types/connection-types';
