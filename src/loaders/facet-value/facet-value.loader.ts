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
    LoaderContext,
    EntityValidationResult,
    EntityFieldSchema,
    TargetOperation,
} from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { VendureEntityType, TARGET_OPERATION } from '../../constants/enums';
import { BaseEntityLoader, ExistingEntityLookupResult, LoaderMetadata } from '../base';
import {
    FacetValueInput,
    FACET_VALUE_LOADER_METADATA,
} from './types';
import {
    resolveFacetId,
    resolveFacetIdFromCode,
    shouldUpdateField,
} from './helpers';

/**
 * FacetValueLoader - Refactored to extend BaseEntityLoader
 *
 * Imports facet values (attribute options) with parent facet resolution.
 * Note: This loader resolves facetId inside createEntity/updateEntity
 * to maintain the base class pattern while supporting parent resolution.
 */
@Injectable()
export class FacetValueLoader extends BaseEntityLoader<FacetValueInput, FacetValue> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = FACET_VALUE_LOADER_METADATA;

    // Cache for resolved facet IDs to avoid repeated lookups
    private facetCache = new Map<string, ID>();

    constructor(
        private connection: TransactionalConnection,
        private facetValueService: FacetValueService,
        private facetService: FacetService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FACET_VALUE_LOADER);
    }

    protected getDuplicateErrorMessage(record: FacetValueInput): string {
        return `Facet value with code "${record.code}" already exists in facet "${record.facetCode}"`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: FacetValueInput,
    ): Promise<ExistingEntityLookupResult<FacetValue> | null> {
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
        ctx: RequestContext,
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

            // Validate that the parent facet exists
            if (record.facetCode || record.facetId) {
                const facetId = await resolveFacetId(ctx, this.facetService, record, this.facetCache);
                if (!facetId) {
                    errors.push({
                        field: 'facetCode',
                        message: `Parent facet "${record.facetCode}" not found`,
                        code: 'PARENT_NOT_FOUND'
                    });
                }
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

    protected async createEntity(context: LoaderContext, record: FacetValueInput): Promise<ID | null> {
        const { ctx } = context;

        const facetId = await resolveFacetId(ctx, this.facetService, record, this.facetCache);
        if (!facetId) {
            // This shouldn't happen if validation passed, but handle defensively
            this.logger.error(`Parent facet "${record.facetCode}" not found during create`);
            return null;
        }

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

    protected async updateEntity(context: LoaderContext, facetValueId: ID, record: FacetValueInput): Promise<void> {
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
