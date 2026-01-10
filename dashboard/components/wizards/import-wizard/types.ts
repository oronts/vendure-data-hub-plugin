/**
 * Import Wizard Types
 * Type definitions for the import wizard components
 */

import type { EnhancedSchemaDefinition } from '../../../types/index';

export interface ImportWizardProps {
    onComplete: (config: ImportConfiguration) => void;
    onCancel: () => void;
    initialConfig?: Partial<ImportConfiguration>;
}

export interface ImportConfiguration {
    name: string;
    description?: string;

    // Source Configuration
    source: SourceConfig;

    // Target Entity
    targetEntity: string;
    targetSchema?: EnhancedSchemaDefinition;

    // Field Mappings
    mappings: FieldMapping[];

    // Import Strategies
    strategies: ImportStrategies;

    // Trigger Configuration
    trigger: TriggerConfig;

    // Transformations
    transformations: TransformationStep[];
}

export interface SourceConfig {
    type: 'file' | 'api' | 'database' | 'webhook';
    fileConfig?: {
        format: 'csv' | 'xlsx' | 'json' | 'xml';
        hasHeaders: boolean;
        delimiter?: string;
        encoding?: string;
        sheetName?: string;
    };
    apiConfig?: {
        url: string;
        method: 'GET' | 'POST';
        headers?: Record<string, string>;
        body?: string;
        pagination?: {
            type: 'offset' | 'cursor' | 'page';
            pageSize: number;
        };
    };
    databaseConfig?: {
        connectionId: string;
        query: string;
    };
    webhookConfig?: {
        path: string;
        secret?: string;
    };
}

export interface FieldMapping {
    sourceField: string;
    targetField: string;
    transformation?: string;
    defaultValue?: unknown;
    required: boolean;
    preview?: unknown[];
}

export interface ImportStrategies {
    // How to handle existing records
    existingRecords: 'skip' | 'update' | 'replace' | 'error';

    // Lookup strategy for finding existing records
    lookupFields: string[];

    // What to do with new records
    newRecords: 'create' | 'skip' | 'error';

    // Publishing strategy
    publishAfterImport: boolean;
    publishDelay?: number;

    // Cleanup strategy
    cleanupStrategy: 'none' | 'unpublish-missing' | 'delete-missing';

    // Batch processing
    batchSize: number;
    parallelBatches: number;

    // Error handling
    errorThreshold: number;
    continueOnError: boolean;
}

export interface TriggerConfig {
    type: 'manual' | 'schedule' | 'webhook' | 'file';
    cron?: string; // Cron expression
    webhookPath?: string;
    fileWatchPath?: string;
}

/** Transformation type union for type-safe step creation */
export type TransformationType = 'map' | 'filter' | 'aggregate' | 'lookup' | 'split' | 'merge' | 'formula' | 'validate';

export interface TransformationStep {
    id: string;
    type: TransformationType;
    config: Record<string, unknown>;
}

export interface ParsedData {
    headers: string[];
    rows: Record<string, unknown>[];
}

export interface WizardStep {
    id: string;
    label: string;
    icon: React.FC<{ className?: string }>;
}
