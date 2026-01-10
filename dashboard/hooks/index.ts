/**
 * Dashboard Hooks
 * Barrel export for all shared hooks
 *
 * Hooks are organized into categories:
 * - state: State management hooks (debounce, localStorage, toggle, previous)
 * - ui: UI interaction hooks (disclosure)
 * - data: Data processing hooks (file parsing, field mapping)
 */

// =============================================================================
// STATE HOOKS
// =============================================================================

export { useDebounce } from './useDebounce';
export { useLocalStorage } from './useLocalStorage';
export { useToggle } from './useToggle';
export { usePrevious } from './usePrevious';

// JSON Validation Hook
export { useJsonValidation, parseJsonWithDetails } from './useJsonValidation';
export type {
    JsonValidationError,
    UseJsonValidationOptions,
    UseJsonValidationResult,
} from './useJsonValidation';

// =============================================================================
// UI HOOKS
// =============================================================================

export { useDisclosure } from './useDisclosure';
export type { UseDisclosureReturn } from './useDisclosure';

// =============================================================================
// DATA HOOKS
// =============================================================================

// File parsing hook
export { useFileParser, getFileType } from './useFileParser';
export type {
    FileType,
    ParsedColumn,
    ParsedFile,
    UseFileParserOptions,
    UseFileParserResult,
} from './useFileParser';

// Field mapping hook
export { useFieldMapping } from './useFieldMapping';
export type {
    FieldMapping,
    SourceField,
    TargetField,
    UseFieldMappingOptions,
    UseFieldMappingResult,
} from './useFieldMapping';

// =============================================================================
// ADAPTER CATALOG HOOK
// =============================================================================

export {
    useAdapterCatalog,
    buildAdapterMetadata,
    adapterTypeToNodeType,
    adapterTypeToCategory,
    TYPE_ICONS,
    TYPE_COLORS,
    CODE_ICONS,
    CODE_COLORS,
} from './use-adapter-catalog';

export type {
    AdapterMetadata,
    AdapterCatalog,
    AdapterNodeType,
    SchemaField as AdapterSchemaField,
    UseAdapterCatalogResult,
} from './use-adapter-catalog';

// =============================================================================
// CATEGORY RE-EXPORTS (for grouped imports)
// =============================================================================

export * as stateHooks from './state';
export * as uiHooks from './ui';
export * as dataHooks from './data';
