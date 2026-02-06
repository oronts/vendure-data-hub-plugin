import { Injectable } from '@nestjs/common';
import {
    ID,
    Facet,
    RequestContext,
    TransactionalConnection,
    FacetService,
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
    FacetInput,
    FACET_LOADER_METADATA,
} from './types';
import { shouldUpdateField } from '../shared-helpers';

/**
 * FacetLoader - Refactored to extend BaseEntityLoader
 *
 * This eliminates ~60 lines of duplicate load() method code that was
 * copy-pasted across all loaders. The base class handles:
 * - Result initialization
 * - Validation loop
 * - Duplicate detection
 * - CREATE/UPDATE/UPSERT operation logic
 * - Dry run mode
 * - Error handling
 */
@Injectable()
export class FacetLoader extends BaseEntityLoader<FacetInput, Facet> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = FACET_LOADER_METADATA;

    constructor(
        private connection: TransactionalConnection,
        private facetService: FacetService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FACET_LOADER);
    }

    protected getDuplicateErrorMessage(record: FacetInput): string {
        return `Facet with code "${record.code}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: FacetInput,
    ): Promise<ExistingEntityLookupResult<Facet> | null> {
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

        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
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
            entityType: VendureEntityType.FACET,
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

    protected async createEntity(context: LoaderContext, record: FacetInput): Promise<ID | null> {
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

    protected async updateEntity(context: LoaderContext, facetId: ID, record: FacetInput): Promise<void> {
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
