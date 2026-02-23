import { ID, RequestContext } from '@vendure/core';
import {
    TargetOperation,
    VendureEntityType,
    InputRecord,
    LoaderOptions,
    EntityLoadResult,
    EntityValidationResult,
    EntityFieldSchema,
} from '../../shared/types';

export type {
    InputRecord,
    LoaderOptions,
    EntityLoadResult,
    EntityLoadError,
    EntityValidationResult,
    EntityValidationError,
    EntityValidationWarning,
    EntityFieldSchema,
    EntityFieldType,
    EntityField,
} from '../../shared/types';

export interface LoaderContext {
    ctx: RequestContext;
    pipelineId: ID;
    runId: ID;
    operation: TargetOperation;
    lookupFields: string[];
    channelIds?: ID[];
    dryRun: boolean;
    options: LoaderOptions;
}

export interface EntityLoader<TInput extends InputRecord = InputRecord> {
    readonly entityType: VendureEntityType;
    readonly name: string;
    readonly description?: string;
    readonly adapterCode: string;
    readonly supportedOperations: TargetOperation[];
    readonly lookupFields: string[];
    readonly requiredFields: string[];

    load(context: LoaderContext, records: TInput[]): Promise<EntityLoadResult>;

    findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: TInput,
    ): Promise<{ id: ID; entity: unknown } | null>;

    validate(
        ctx: RequestContext,
        record: TInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult>;

    getFieldSchema(): EntityFieldSchema;
}

export interface LoaderRegistry {
    register(loader: EntityLoader): void;
    get(entityType: VendureEntityType): EntityLoader | undefined;
    getAll(): EntityLoader[];
    has(entityType: VendureEntityType): boolean;
}
