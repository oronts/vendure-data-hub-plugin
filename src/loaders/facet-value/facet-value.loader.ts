import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    FacetValueService,
    FacetService,
    FacetValue,
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
import { VendureEntityType, TARGET_OPERATION } from '../../constants/enums';
import {
    FacetValueInput,
    ExistingEntityResult,
    FACET_VALUE_LOADER_METADATA,
} from './types';
import {
    resolveFacetId,
    resolveFacetIdFromCode,
    isRecoverableError,
    shouldUpdateField,
} from './helpers';

@Injectable()
export class FacetValueLoader implements EntityLoader<FacetValueInput> {
    private readonly logger: DataHubLogger;

    readonly entityType = FACET_VALUE_LOADER_METADATA.entityType;
    readonly name = FACET_VALUE_LOADER_METADATA.name;
    readonly description = FACET_VALUE_LOADER_METADATA.description;
    readonly supportedOperations: TargetOperation[] = [...FACET_VALUE_LOADER_METADATA.supportedOperations];
    readonly lookupFields = [...FACET_VALUE_LOADER_METADATA.lookupFields];
    readonly requiredFields = [...FACET_VALUE_LOADER_METADATA.requiredFields];

    constructor(
        private _connection: TransactionalConnection,
        private facetValueService: FacetValueService,
        private facetService: FacetService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FACET_VALUE_LOADER);
    }

    async load(context: LoaderContext, records: FacetValueInput[]): Promise<EntityLoadResult> {
        const result: EntityLoadResult = {
            succeeded: 0,
            failed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [],
            affectedIds: [],
        };

        const facetCache = new Map<string, ID>();

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

                const facetId = await resolveFacetId(context.ctx, this.facetService, record, facetCache);
                if (!facetId) {
                    result.failed++;
                    result.errors.push({
                        record,
                        message: `Parent facet "${record.facetCode}" not found`,
                        code: 'PARENT_NOT_FOUND',
                        recoverable: false,
                    });
                    continue;
                }

                const existing = await this.findExisting(context.ctx, context.lookupFields, record);

                if (existing) {
                    if (context.operation === TARGET_OPERATION.CREATE) {
                        if (context.options.skipDuplicates) {
                            result.skipped++;
                            continue;
                        }
                        result.failed++;
                        result.errors.push({
                            record,
                            message: `Facet value with code "${record.code}" already exists in facet "${record.facetCode}"`,
                            code: 'DUPLICATE',
                            recoverable: false,
                        });
                        continue;
                    }

                    if (!context.dryRun) {
                        await this.updateFacetValue(context, existing.id, record);
                    }
                    result.updated++;
                    result.affectedIds.push(existing.id);
                } else {
                    if (context.operation === TARGET_OPERATION.UPDATE) {
                        result.skipped++;
                        continue;
                    }

                    if (!context.dryRun) {
                        const newId = await this.createFacetValue(context, record, facetId);
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
                this.logger.error(`Failed to load facet value`, error instanceof Error ? error : undefined);
            }
        }

        return result;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: FacetValueInput,
    ): Promise<ExistingEntityResult | null> {
        // Primary lookup: by code - need to search through facet values of the parent facet
        if (record.code && lookupFields.includes('code')) {
            const facetId = record.facetId || await resolveFacetIdFromCode(ctx, this.facetService, record.facetCode);
            if (facetId) {
                const facetValues = await this.facetValueService.findByFacetId(ctx, facetId as ID);
                const match = facetValues.find(fv => fv.code === record.code);
                if (match) {
                    return { id: match.id, entity: match as FacetValue };
                }
            }
        }

        // Fallback: by ID
        if (record.id && lookupFields.includes('id')) {
            const facetValue = await this.facetValueService.findOne(ctx, record.id as ID);
            if (facetValue) {
                return { id: facetValue.id, entity: facetValue as FacetValue };
            }
        }

        return null;
    }

    async validate(
        _ctx: RequestContext,
        record: FacetValueInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const errors: { field: string; message: string; code?: string }[] = [];
        const warnings: { field: string; message: string }[] = [];

        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
            if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
                errors.push({ field: 'name', message: 'Facet value name is required', code: 'REQUIRED' });
            }
            if (!record.code || typeof record.code !== 'string' || record.code.trim() === '') {
                errors.push({ field: 'code', message: 'Facet value code is required', code: 'REQUIRED' });
            } else if (!/^[a-z0-9_-]+$/i.test(record.code)) {
                errors.push({
                    field: 'code',
                    message: 'Code must contain only letters, numbers, hyphens, and underscores',
                    code: 'INVALID_FORMAT'
                });
            }
            if (!record.facetCode && !record.facetId) {
                errors.push({ field: 'facetCode', message: 'Parent facet code or ID is required', code: 'REQUIRED' });
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
            entityType: VendureEntityType.FACET_VALUE,
            fields: [
                {
                    key: 'name',
                    label: 'Value Name',
                    type: 'string',
                    required: true,
                    translatable: true,
                    description: 'Display name for the facet value (e.g., "Red", "Large", "Nike")',
                    example: 'Red',
                },
                {
                    key: 'code',
                    label: 'Code',
                    type: 'string',
                    required: true,
                    lookupable: true,
                    description: 'Unique identifier code within the facet (lowercase, no spaces)',
                    example: 'red',
                    validation: {
                        pattern: '^[a-z0-9_-]+$',
                    },
                },
                {
                    key: 'facetCode',
                    label: 'Parent Facet Code',
                    type: 'string',
                    required: true,
                    description: 'Code of the parent facet this value belongs to',
                    example: 'color',
                },
                {
                    key: 'facetId',
                    label: 'Parent Facet ID',
                    type: 'string',
                    description: 'ID of the parent facet (alternative to facetCode)',
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

    private async createFacetValue(context: LoaderContext, record: FacetValueInput, facetId: ID): Promise<ID> {
        const { ctx } = context;

        const facet = await this.facetService.findOne(ctx, facetId);
        if (!facet) {
            throw new Error(`Facet with ID ${facetId} not found`);
        }

        const facetValue = await this.facetValueService.create(ctx, facet, {
            code: record.code,
            translations: [
                {
                    languageCode: ctx.languageCode,
                    name: record.name,
                },
            ],
            customFields: record.customFields as Record<string, unknown>,
        });

        this.logger.log(`Created facet value ${record.name} (code: ${record.code}, ID: ${facetValue.id})`);
        return facetValue.id;
    }

    private async updateFacetValue(context: LoaderContext, facetValueId: ID, record: FacetValueInput): Promise<void> {
        const { ctx, options } = context;

        const updateInput: Record<string, unknown> = { id: facetValueId };

        if (record.code !== undefined && shouldUpdateField('code', options.updateOnlyFields)) {
            updateInput.code = record.code;
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

        await this.facetValueService.update(ctx, updateInput as Parameters<typeof this.facetValueService.update>[1]);

        this.logger.debug(`Updated facet value ${record.name} (ID: ${facetValueId})`);
    }
}
