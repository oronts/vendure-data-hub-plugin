import type { JsonObject, JsonValue } from '../../types/index';
import type { AdapterCategory, AdapterType } from '../../../shared/types';
import type { StepConfigSchema } from './schema-types';

/**
 * Base adapter interface shared by all adapter types.
 * Contains metadata and schema for UI auto-generation.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- TConfig is used by extending interfaces
export interface BaseAdapter<TConfig = JsonObject> {
    /** Primary adapter type */
    readonly type: AdapterType;
    /** Unique adapter code (used in pipeline definitions) */
    readonly code: string;
    /** Display name */
    readonly name?: string;
    /** Description for documentation */
    readonly description?: string;
    /** Category for UI organization */
    readonly category?: AdapterCategory | string;
    /** Configuration schema for UI form generation */
    readonly schema: StepConfigSchema;
    /** For operators: whether side-effect free (stream-safe) */
    readonly pure?: boolean;
    /** Whether this adapter performs async operations */
    readonly async?: boolean;
    /** Whether records can be batched */
    readonly batchable?: boolean;
    /** Permissions required to use this adapter */
    readonly requires?: readonly string[];
    /** Icon name for UI */
    readonly icon?: string;
    /** Color for UI */
    readonly color?: string;
    /** Adapter version */
    readonly version?: string;
    /** Data Hub adapter API contract version */
    readonly apiVersion?: number;
    /** Whether the adapter is deprecated */
    readonly deprecated?: boolean;
    /** Message explaining deprecation and migration path */
    readonly deprecatedMessage?: string;
    /** Whether the adapter is experimental/beta and may change */
    readonly experimental?: boolean;
    /** Message explaining experimental status and limitations */
    readonly experimentalMessage?: string;
    /** For loaders: the Vendure entity type this loader handles */
    readonly entityType?: string;
    /** For exporters/feeds: the base output file format */
    readonly formatType?: string;
    /** For loaders: fields that can be patched during error retry */
    readonly patchableFields?: readonly string[];
    /** For operators: which custom editor to use in the UI ('map' | 'template' | 'filter') */
    readonly editorType?: string;
    /** For operators: template string for config summary display (e.g. "${from} → ${to}") */
    readonly summaryTemplate?: string;
    /** Human-readable category label for UI display (e.g. "String", "Numeric") */
    readonly categoryLabel?: string;
    /** Sort order for category display in the UI (lower = first) */
    readonly categoryOrder?: number;
    /** For operators: whether this operator is suitable for field-level transforms in the export wizard */
    readonly fieldTransform?: boolean;
}

/**
 * Immutable SDK contract for custom adapter registration.
 *
 * The shared API-serialization definition intentionally has a different shape.
 */
export interface AdapterDefinition {
    readonly type: AdapterType;
    readonly code: string;
    readonly name?: string;
    readonly description?: string;
    readonly category?: AdapterCategory | string;
    readonly schema: StepConfigSchema;
    readonly pure?: boolean;
    readonly async?: boolean;
    readonly batchable?: boolean;
    readonly requires?: readonly string[];
    readonly icon?: string;
    readonly color?: string;
    readonly version?: string;
    readonly apiVersion?: number;
    readonly deprecated?: boolean;
    readonly deprecatedMessage?: string;
    readonly experimental?: boolean;
    readonly experimentalMessage?: string;
    readonly entityType?: string;
    readonly formatType?: string;
    readonly patchableFields?: readonly string[];
    readonly editorType?: string;
    readonly summaryTemplate?: string;
    readonly categoryLabel?: string;
    readonly categoryOrder?: number;
    readonly wizardHidden?: boolean;
    readonly builtIn?: boolean;
    readonly fieldTransform?: boolean;
}

/** Immutable record envelope used by custom adapter implementations. */
export interface RecordEnvelope {
    readonly data: JsonObject;
    readonly meta?: RecordMeta;
}

export interface RecordMeta {
    readonly sourceId?: string;
    readonly sourceTimestamp?: string;
    readonly hash?: string;
    readonly sequence?: number;
    readonly cursor?: string;
    readonly [key: string]: JsonValue | undefined;
}
