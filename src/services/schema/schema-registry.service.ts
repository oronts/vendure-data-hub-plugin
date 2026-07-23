import { Injectable, Optional } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import type {
    JsonObject,
    PipelineStepDefinition,
    SchemaCompatibility,
    SchemaReference,
} from '../../types';
import { Pipeline, PipelineRevision, PipelineRun } from '../../entities/pipeline';
import { DataHubSchema } from '../../entities/config';
import { LOGGER_CONTEXTS, SCHEMA_REGISTRY } from '../../constants';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { getErrorMessage, isDuplicateEntryError } from '../../utils/error.utils';
import {
    assertSchemaDefinition,
    assertBoundedJsonObject,
    SchemaValidationIssue,
    validateSchemaRecord,
} from './schema-definition';
import { assertCompatibleSchemaEvolution } from './schema-compatibility';
import { assertSchemaId, assertSchemaVersion } from './schema-reference';
import { DistributedLockService } from '../runtime/distributed-lock.service';

const SCHEMA_COMPATIBILITIES = [
    'STRICT',
    'BACKWARD',
    'PERMISSIVE',
] as const satisfies readonly SchemaCompatibility[];

export interface CreateDataHubSchemaInput {
    readonly schemaId: string;
    readonly version: string;
    readonly compatibility?: string | null;
    readonly definition: JsonObject;
    readonly metadata?: JsonObject | null;
}

export interface UpdateDataHubSchemaInput {
    readonly metadata?: JsonObject | null;
}

export interface DataHubSchemaUsage {
    readonly pipelineId: ID;
    readonly pipelineCode: string;
    readonly pipelineName: string;
    readonly pipelineStatus: string;
    readonly stepKey: string;
    readonly stepType: string;
    readonly revisionId: ID | null;
    readonly revisionType: string;
    readonly runId: ID | null;
    readonly runStatus: string | null;
}

export interface SchemaRecordValidation {
    readonly record: JsonObject;
    readonly issues: readonly SchemaValidationIssue[];
}

export interface SchemaRecordValidationResult {
    readonly schema: DataHubSchema;
    readonly records: readonly SchemaRecordValidation[];
}

export class SchemaInUseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SchemaInUseError';
    }
}

@Injectable()
export class SchemaRegistryService {
    private readonly logger: DataHubLogger;

    constructor(
        private readonly connection: TransactionalConnection,
        loggerFactory: DataHubLoggerFactory,
        @Optional()
        private readonly locks?: DistributedLockService,
    ) {
        this.logger = loggerFactory.createLogger(
            LOGGER_CONTEXTS.SCHEMA_REGISTRY_SERVICE,
        );
    }

    async getById(
        ctx: RequestContext,
        id: ID,
    ): Promise<DataHubSchema | null> {
        return this.connection.getRepository(ctx, DataHubSchema).findOne({
            where: { id },
        });
    }

    async getByReference(
        ctx: RequestContext,
        reference: SchemaReference,
    ): Promise<DataHubSchema | null> {
        return this.connection.getRepository(ctx, DataHubSchema).findOne({
            where: {
                schemaId: reference.schemaId,
                version: reference.version,
            },
        });
    }

    async getByReferences(
        ctx: RequestContext,
        references: readonly SchemaReference[],
    ): Promise<ReadonlyMap<string, DataHubSchema>> {
        const unique = new Map<string, SchemaReference>();
        for (const reference of references) {
            unique.set(schemaReferenceKey(reference), reference);
        }
        if (unique.size === 0) return new Map();
        const schemas = await this.connection.getRepository(ctx, DataHubSchema).find({
            where: [...unique.values()].map(reference => ({
                schemaId: reference.schemaId,
                version: reference.version,
            })),
        });
        return new Map(schemas.map(schema => [schemaReferenceKey(schema), schema]));
    }

    async findVersions(
        ctx: RequestContext,
        schemaId: string,
    ): Promise<DataHubSchema[]> {
        assertSchemaId(schemaId);
        const versions = await this.connection.getRepository(ctx, DataHubSchema).find({
            where: { schemaId },
            order: { createdAt: 'DESC', id: 'DESC' },
            take: SCHEMA_REGISTRY.MAX_VERSIONS_PER_SCHEMA + 1,
        });
        if (versions.length > SCHEMA_REGISTRY.MAX_VERSIONS_PER_SCHEMA) {
            throw new Error(
                `Schema version listing exceeded the safe limit of ${SCHEMA_REGISTRY.MAX_VERSIONS_PER_SCHEMA}`,
            );
        }
        return versions;
    }

    async create(
        ctx: RequestContext,
        input: CreateDataHubSchemaInput,
    ): Promise<DataHubSchema> {
        assertSchemaId(input.schemaId);
        assertSchemaVersion(input.version);
        assertSchemaDefinition(input.definition, {
            schemaId: input.schemaId,
            version: input.version,
        });
        assertSchemaMetadata(input.metadata);
        const create = () => this.createVersion(ctx, input);
        return this.locks
            ? this.locks.withLock(
                `schema-registry:${input.schemaId}`,
                create,
                { waitForLock: true },
            )
            : create();
    }

    private async createVersion(
        ctx: RequestContext,
        input: CreateDataHubSchemaInput,
    ): Promise<DataHubSchema> {
        const repository = this.connection.getRepository(ctx, DataHubSchema);
        const duplicate = await repository.findOne({
            where: { schemaId: input.schemaId, version: input.version },
        });
        if (duplicate) {
            throw new Error(
                `Schema "${input.schemaId}" version "${input.version}" already exists`,
            );
        }
        const compatibility = parseSchemaCompatibility(input.compatibility);
        const previous = await repository.findOne({
            where: { schemaId: input.schemaId },
            order: { createdAt: 'DESC', id: 'DESC' },
        });
        if (previous) {
            assertCompatibleSchemaEvolution(
                previous.definition,
                input.definition,
                compatibility,
            );
        }
        const entity = new DataHubSchema();
        entity.schemaId = input.schemaId;
        entity.version = input.version;
        entity.compatibility = compatibility;
        entity.definition = input.definition;
        entity.metadata = input.metadata ?? null;
        try {
            const saved = await repository.save(entity);
            this.logger.info('Schema version created', {
                schemaId: saved.schemaId,
                schemaVersion: saved.version,
            });
            return saved;
        } catch (error: unknown) {
            if (isDuplicateEntryError(getErrorMessage(error))) {
                throw new Error(
                    `Schema "${input.schemaId}" version "${input.version}" already exists`,
                );
            }
            throw error;
        }
    }

    async update(
        ctx: RequestContext,
        id: ID,
        input: UpdateDataHubSchemaInput,
    ): Promise<DataHubSchema | null> {
        const repository = this.connection.getRepository(ctx, DataHubSchema);
        const entity = await repository.findOne({ where: { id } });
        if (!entity) return null;

        assertSchemaMetadata(input.metadata);
        if (input.metadata !== undefined) entity.metadata = input.metadata;
        const saved = await repository.save(entity);
        this.logger.info('Schema version updated', {
            schemaId: saved.schemaId,
            schemaVersion: saved.version,
        });
        return saved;
    }

    async delete(ctx: RequestContext, id: ID): Promise<boolean> {
        const repository = this.connection.getRepository(ctx, DataHubSchema);
        const entity = await repository.findOne({ where: { id } });
        if (!entity) return false;
        await this.assertUnused(ctx, entity.schemaId, entity.version);
        await repository.remove(entity);
        this.logger.info('Schema version deleted', {
            schemaId: entity.schemaId,
            schemaVersion: entity.version,
        });
        return true;
    }

    async findUsage(
        ctx: RequestContext,
        schemaId: string,
        version: string,
    ): Promise<DataHubSchemaUsage[]> {
        const pipelines = await this.connection.getRepository(ctx, Pipeline).find({
            take: SCHEMA_REGISTRY.MAX_PIPELINE_DISCOVERY + 1,
        });
        if (pipelines.length > SCHEMA_REGISTRY.MAX_PIPELINE_DISCOVERY) {
            throw new Error(
                `Schema usage discovery exceeded the safe limit of ${SCHEMA_REGISTRY.MAX_PIPELINE_DISCOVERY}`,
            );
        }
        const pipelineById = new Map(
            pipelines.map(pipeline => [String(pipeline.id), pipeline]),
        );
        const workingUsage = pipelines.flatMap(pipeline => pipeline.definition.steps
            .filter(step => schemaReferencesMatch(step.schemaRef, schemaId, version))
            .map(step => ({
                pipelineId: pipeline.id,
                pipelineCode: pipeline.code,
                pipelineName: pipeline.name,
                pipelineStatus: pipeline.status,
                stepKey: step.key,
                stepType: step.type,
                revisionId: null,
                revisionType: 'WORKING',
                runId: null,
                runStatus: null,
            })));
        const revisions = await this.connection
            .getRepository(ctx, PipelineRevision)
            .find({ take: SCHEMA_REGISTRY.MAX_PIPELINE_DISCOVERY + 1 });
        if (revisions.length > SCHEMA_REGISTRY.MAX_PIPELINE_DISCOVERY) {
            throw new Error(
                `Schema revision usage discovery exceeded the safe limit of ${SCHEMA_REGISTRY.MAX_PIPELINE_DISCOVERY}`,
            );
        }
        const revisionUsage: DataHubSchemaUsage[] = revisions.flatMap(revision => {
            const pipeline = pipelineById.get(String(revision.pipelineId));
            if (!pipeline) return [];
            return revision.definition.steps
                .filter(step => schemaReferencesMatch(step.schemaRef, schemaId, version))
                .map(step => ({
                    pipelineId: pipeline.id,
                    pipelineCode: pipeline.code,
                    pipelineName: pipeline.name,
                    pipelineStatus: pipeline.status,
                    stepKey: step.key,
                    stepType: step.type,
                    revisionId: revision.id,
                    revisionType: revision.type,
                    runId: null,
                    runStatus: null,
                }));
        });
        const runs = await this.connection.getRepository(ctx, PipelineRun).find({
            take: SCHEMA_REGISTRY.MAX_PIPELINE_DISCOVERY + 1,
        });
        if (runs.length > SCHEMA_REGISTRY.MAX_PIPELINE_DISCOVERY) {
            throw new Error(
                `Schema run usage discovery exceeded the safe limit of ${SCHEMA_REGISTRY.MAX_PIPELINE_DISCOVERY}`,
            );
        }
        const runUsage: DataHubSchemaUsage[] = runs.flatMap(run => {
            const pipeline = pipelineById.get(String(run.pipelineId));
            if (!pipeline || !run.definitionSnapshot) return [];
            return run.definitionSnapshot.steps
                .filter(step => schemaReferencesMatch(step.schemaRef, schemaId, version))
                .map(step => ({
                    pipelineId: pipeline.id,
                    pipelineCode: pipeline.code,
                    pipelineName: pipeline.name,
                    pipelineStatus: pipeline.status,
                    stepKey: step.key,
                    stepType: step.type,
                    revisionId: run.revisionId,
                    revisionType: 'RUN_SNAPSHOT',
                    runId: run.id,
                    runStatus: run.status,
                }));
        });
        return [...workingUsage, ...revisionUsage, ...runUsage]
            .sort((left, right) => (
                left.pipelineCode.localeCompare(right.pipelineCode)
                || left.stepKey.localeCompare(right.stepKey)
            ));
    }

    async validateRecords(
        ctx: RequestContext,
        reference: SchemaReference,
        records: readonly JsonObject[],
    ): Promise<SchemaRecordValidationResult> {
        if (records.length > SCHEMA_REGISTRY.MAX_RECORDS_PER_VALIDATION_BATCH) {
            throw new Error(
                `Schema validation batches cannot exceed ${SCHEMA_REGISTRY.MAX_RECORDS_PER_VALIDATION_BATCH} records`,
            );
        }
        const schema = await this.getByReference(ctx, reference);
        if (!schema) {
            throw new Error(
                `Schema "${reference.schemaId}" version "${reference.version}" does not exist`,
            );
        }
        return {
            schema,
            records: records.map(record => ({
                record,
                issues: validateSchemaRecord(
                    schema.definition,
                    record,
                    schema.compatibility,
                ),
            })),
        };
    }

    private async assertUnused(
        ctx: RequestContext,
        schemaId: string,
        version: string,
    ): Promise<void> {
        const usage = await this.findUsage(ctx, schemaId, version);
        if (usage.length === 0) return;
        throw new SchemaInUseError(
            `Schema "${schemaId}" version "${version}" is used by: ${formatUsage(usage)}. Remove or replace those references before deleting it.`,
        );
    }
}

function parseSchemaCompatibility(
    value: string | null | undefined,
): SchemaCompatibility {
    const normalized = value?.trim().toUpperCase() ?? 'BACKWARD';
    if (!SCHEMA_COMPATIBILITIES.includes(normalized as SchemaCompatibility)) {
        throw new Error(
            `Schema compatibility must be one of: ${SCHEMA_COMPATIBILITIES.join(', ')}`,
        );
    }
    return normalized as SchemaCompatibility;
}

function schemaReferencesMatch(
    reference: PipelineStepDefinition['schemaRef'],
    schemaId: string,
    version: string,
): boolean {
    return reference?.schemaId === schemaId && reference.version === version;
}

function schemaReferenceKey(reference: SchemaReference): string {
    return `${reference.schemaId}\u0000${reference.version}`;
}

function formatUsage(usage: readonly DataHubSchemaUsage[]): string {
    return usage
        .map(item => item.runId === null
            ? `${item.pipelineCode}/${item.stepKey}`
            : `${item.pipelineCode}/${item.stepKey} (run ${String(item.runId)})`)
        .join(', ');
}

function assertSchemaMetadata(metadata: JsonObject | null | undefined): void {
    if (metadata == null) return;
    if (
        typeof metadata !== 'object'
        || Array.isArray(metadata)
    ) {
        throw new Error('Schema metadata must be a JSON object');
    }
    assertBoundedJsonObject(metadata, {
        label: 'Schema metadata',
        maxBytes: SCHEMA_REGISTRY.MAX_METADATA_BYTES,
        maxDepth: SCHEMA_REGISTRY.MAX_METADATA_DEPTH,
    });
}
