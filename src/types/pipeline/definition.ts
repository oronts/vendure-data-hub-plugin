/**
 * Core Pipeline Definition Types
 *
 * Main pipeline definition interface importing from modular type files.
 */

import { JsonObject, JsonValue } from '../common';
import { SourceConfig } from './source';
import { TargetConfig } from './target';
import { FieldMapping } from './mapping';
import { FilterCondition } from './filter';
import { PipelineOptions } from './options';
import { TriggerConfig } from './trigger-types';
import { PipelineHooksConfig, PipelineHooks } from './hook-types';
import {
    PipelineStepDefinition,
    PipelineEdge,
    PipelineCapabilities,
} from './step-types';
import { PipelineContext, PipelineCheckpoint } from './context-types';
import { PipelineMetrics } from './execution-types';
import { FileFormatType, PipelineSourceType } from '../../constants/enums';

// CORE ENUMS (re-exported from constants for convenience)

/** Pipeline direction/type */
export type PipelineType = 'IMPORT' | 'EXPORT' | 'SYNC';

/** Target operation for import pipelines */
export type TargetOperation = 'CREATE' | 'UPDATE' | 'UPSERT' | 'MERGE' | 'DELETE';

/** Error handling strategy */
export type ErrorStrategy = 'SKIP' | 'ABORT' | 'QUARANTINE' | 'RETRY';

/** Vendure entity types that can be imported/exported */
export type VendureEntityType =
    | 'Product'
    | 'ProductVariant'
    | 'Customer'
    | 'CustomerGroup'
    | 'Order'
    | 'Collection'
    | 'Facet'
    | 'FacetValue'
    | 'Asset'
    | 'Promotion'
    | 'ShippingMethod'
    | 'PaymentMethod'
    | 'TaxCategory'
    | 'TaxRate'
    | 'Country'
    | 'Zone'
    | 'Channel'
    | 'Tag'
    | 'StockLocation'
    | 'Inventory';

export type SourceType = PipelineSourceType;

export type FileFormat = FileFormatType;

/** Destination types for export */
export type DestinationType =
    | 'DOWNLOAD'     // User downloads file
    | 'S3'           // Upload to S3
    | 'FTP'          // Upload to FTP/SFTP
    | 'HTTP'         // POST to webhook
    | 'EMAIL';       // Send as attachment

/** Feed types for marketplace exports */
export type FeedType =
    | 'GOOGLE_SHOPPING'
    | 'META_CATALOG'
    | 'AMAZON'
    | 'PINTEREST'
    | 'TIKTOK'
    | 'BING_SHOPPING'
    | 'CUSTOM';

/** Trigger types */
export type TriggerType = 'MANUAL' | 'SCHEDULE' | 'WEBHOOK' | 'EVENT' | 'FILE_WATCH';

// UNIFIED PIPELINE DEFINITION (Visual Editor Format)

/**
 * Unified Pipeline Definition
 * Designed for both code-first configuration and visual editor
 */
export interface UnifiedPipelineDefinition {
    /** Schema version for migrations */
    version: 1;

    /** Pipeline type: IMPORT, EXPORT, or SYNC */
    type: PipelineType;

    /** Source configuration - where data comes from */
    source: SourceConfig;

    /** Target configuration - where data goes */
    target: TargetConfig;

    /** Field mappings with transforms */
    mappings: FieldMapping[];

    /** Optional filters to include/exclude records */
    filters?: FilterCondition[];

    /** Processing options */
    options: PipelineOptions;

    /** Trigger configuration (when to run) */
    triggers?: TriggerConfig[];

    /** Hooks for pre/post processing */
    hooks?: PipelineHooksConfig;

    /** Schema code reference for validation */
    schemaCode?: string;
}

// PIPELINE DEFINITION (Step-based Format)

/**
 * Pipeline Definition
 * Step-based format for programmatic pipeline configuration
 */
export interface PipelineDefinition {
    /** Definition version */
    version: number;
    /** Ordered list of pipeline steps */
    steps: PipelineStepDefinition[];
    /** Dependencies on other pipelines */
    dependsOn?: string[];
    /** Pipeline capabilities declaration */
    capabilities?: PipelineCapabilities;
    /** Pipeline execution context */
    context?: PipelineContext;
    /** Explicit step edges for graph-based execution */
    edges?: PipelineEdge[];
    /** Lifecycle hooks */
    hooks?: PipelineHooks;
    /** Primary trigger configuration (when to run) */
    trigger?: TriggerConfig;
    /** Multiple trigger configurations (alternative ways to run) */
    triggers?: TriggerConfig[];
}

export type {
    SourceConfig,
    TargetConfig,
    FieldMapping,
    FilterCondition,
    PipelineOptions,
    TriggerConfig,
    PipelineHooksConfig,
    PipelineHooks,
    PipelineStepDefinition,
    PipelineEdge,
    PipelineCapabilities,
    PipelineContext,
    PipelineCheckpoint,
    PipelineMetrics,
};
