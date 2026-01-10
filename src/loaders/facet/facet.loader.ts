import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    FacetService,
} from '@vendure/core';
import {
    EntityLoader,
    LoaderContext,
    EntityLoadResult,
    EntityValidationResult,
    EntityFieldSchema,
} from '../../types/index';
import { TargetOperation } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import {
    FacetInput,
    ExistingEntityResult,
    FACET_LOADER_METADATA,
} from './types';
import {
    isRecoverableError,
    shouldUpdateField,
} from './helpers';

@Injectable()
export class FacetLoader implements EntityLoader<FacetInput> {
    private readonly logger: DataHubLogger;

    readonly entityType = FACET_LOADER_METADATA.entityType;
    readonly name = FACET_LOADER_METADATA.name;
    readonly description = FACET_LOADER_METADATA.description;
    readonly supportedOperations: TargetOperation[] = [...FACET_LOADER_METADATA.supportedOperations];
    readonly lookupFields = [...FACET_LOADER_METADATA.lookupFields];
    readonly requiredFields = [...FACET_LOADER_METADATA.requiredFields];

    constructor(
        private _connection: TransactionalConnection,
        private facetService: FacetService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FACET_LOADER);
    }

    async load(context: LoaderContext, records: FacetInput[]): Promise<EntityLoadResult> {
        const result: EntityLoadResult = {
            succeeded: 0,
            failed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [],
            affectedIds: [],
        };

        for (const record of records) {
            try {
                const validation = await this.validate(context.ctx, record, context.operation);
                if (!validation.valid) {
                    result.failed++;
                    result.errors.push({
                        record,
                        message: validation.errors.map(e => e.message).join('; '),
                        recoverable: false,
                    });
                    continue;
                }

                const existing = await this.findExisting(context.ctx, context.lookupFields, record);

                if (existing) {
                    if (context.operation === 'CREATE') {
                        if (context.options.skipDuplicates) {
                            result.skipped++;
                            continue;
                        }
                        result.failed++;
                        result.errors.push({
                            record,
                            message: `Facet with code "${record.code}" already exists`,
                            code: 'DUPLICATE',
                            recoverable: false,
                        });
                        continue;
                    }

                    if (!context.dryRun) {
                        await this.updateFacet(context, existing.id, record);
                    }
                    result.updated++;
                    result.affectedIds.push(existing.id);
                } else {
                    if (context.operation === 'UPDATE') {
                        result.skipped++;
                        continue;
                    }

                    if (!context.dryRun) {
                        const newId = await this.createFacet(context, record);
                        result.affectedIds.push(newId);
                    }
                    result.created++;
                }

                result.succeeded++;
            } catch (error) {
                result.failed++;
                result.errors.push({
                    record,
                    message: error instanceof Error ? error.message : String(error),
                    recoverable: isRecoverableError(error),
                });
                this.logger.error(`Failed to load facet`, error instanceof Error ? error : undefined);
            }
        }

        return result;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: FacetInput,
    ): Promise<ExistingEntityResult | null> {
        // Primary lookup: by code
        if (record.code && lookupFields.includes('code')) {
            const facets = await this.facetService.findAll(ctx, {
                filter: { code: { eq: record.code } },
            });
            if (facets.totalItems > 0) {
                return { id: facets.items[0].id, entity: facets.items[0] };
            }
        }

        // Fallback: by ID
        if (record.id && lookupFields.includes('id')) {
            const facet = await this.facetService.findOne(ctx, record.id as ID);
            if (facet) {
                return { id: facet.id, entity: facet };
            }
        }

        // Fallback: by name
        if (record.name && lookupFields.includes('name')) {
            const facets = await this.facetService.findAll(ctx, {
                filter: { name: { eq: record.name } },
            });
            if (facets.totalItems > 0) {
                return { id: facets.items[0].id, entity: facets.items[0] };
            }
        }

        return null;
    }

    async validate(
        _ctx: RequestContext,
        record: FacetInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const errors: { field: string; message: string; code?: string }[] = [];
        const warnings: { field: string; message: string }[] = [];

        if (operation === 'CREATE' || operation === 'UPSERT') {
            if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
                errors.push({ field: 'name', message: 'Facet name is required', code: 'REQUIRED' });
            }
            if (!record.code || typeof record.code !== 'string' || record.code.trim() === '') {
                errors.push({ field: 'code', message: 'Facet code is required', code: 'REQUIRED' });
            } else if (!/^[a-z0-9_-]+$/i.test(record.code)) {
                errors.push({
                    field: 'code',
                    message: 'Code must contain only letters, numbers, hyphens, and underscores',
                    code: 'INVALID_FORMAT'
                });
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    getFieldSchema(): EntityFieldSchema {
        return {
            entityType: 'Facet',
            fields: [
                {
                    key: 'name',
                    label: 'Facet Name',
                    type: 'string',
                    required: true,
                    translatable: true,
                    description: 'Display name for the facet (e.g., "Color", "Size", "Brand")',
                    example: 'Color',
                },
                {
                    key: 'code',
                    label: 'Code',
                    type: 'string',
                    required: true,
                    lookupable: true,
                    description: 'Unique identifier code (lowercase, no spaces)',
                    example: 'color',
                    validation: {
                        pattern: '^[a-z0-9_-]+$',
                    },
                },
                {
                    key: 'isPrivate',
                    label: 'Private',
                    type: 'boolean',
                    description: 'If true, facet is not visible to customers',
                },
                {
                    key: 'customFields',
                    label: 'Custom Fields',
                    type: 'object',
                    description: 'Custom field values',
                },
            ],
        };
    }

    private async createFacet(context: LoaderContext, record: FacetInput): Promise<ID> {
        const { ctx } = context;

        const facet = await this.facetService.create(ctx, {
            code: record.code,
            isPrivate: record.isPrivate ?? false,
            translations: [
                {
                    languageCode: ctx.languageCode,
                    name: record.name,
                },
            ],
            customFields: record.customFields as Record<string, unknown>,
        });

        this.logger.log(`Created facet ${record.name} (code: ${record.code}, ID: ${facet.id})`);
        return facet.id;
    }

    private async updateFacet(context: LoaderContext, facetId: ID, record: FacetInput): Promise<void> {
        const { ctx, options } = context;

        const updateInput: Record<string, unknown> = { id: facetId };

        if (record.code !== undefined && shouldUpdateField('code', options.updateOnlyFields)) {
            updateInput.code = record.code;
        }
        if (record.isPrivate !== undefined && shouldUpdateField('isPrivate', options.updateOnlyFields)) {
            updateInput.isPrivate = record.isPrivate;
        }
        if (record.customFields !== undefined && shouldUpdateField('customFields', options.updateOnlyFields)) {
            updateInput.customFields = record.customFields;
        }

        if (record.name !== undefined && shouldUpdateField('name', options.updateOnlyFields)) {
            updateInput.translations = [
                {
                    languageCode: ctx.languageCode,
                    name: record.name,
                },
            ];
        }

        await this.facetService.update(ctx, updateInput as Parameters<typeof this.facetService.update>[1]);

        this.logger.debug(`Updated facet ${record.name} (ID: ${facetId})`);
    }
}
