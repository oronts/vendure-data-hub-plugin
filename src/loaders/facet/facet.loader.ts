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
import {
    BaseEntityLoader,
    ExistingEntityLookupResult,
    LoaderMetadata,
    ValidationBuilder,
    EntityLookupHelper,
    createLookupHelper,
} from '../base';
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

    private readonly lookupHelper: EntityLookupHelper<FacetService, Facet, FacetInput>;

    constructor(
        private connection: TransactionalConnection,
        private facetService: FacetService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FACET_LOADER);
        this.lookupHelper = createLookupHelper<FacetService, Facet, FacetInput>(this.facetService)
            .addFilterStrategy('code', 'code', (ctx, svc, opts) => svc.findAll(ctx, opts))
            .addIdStrategy((ctx, svc, id) => svc.findOne(ctx, id))
            .addFilterStrategy('name', 'name', (ctx, svc, opts) => svc.findAll(ctx, opts));
    }

    protected getDuplicateErrorMessage(record: FacetInput): string {
        return `Facet with code "${record.code}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: FacetInput,
    ): Promise<ExistingEntityLookupResult<Facet> | null> {
        return this.lookupHelper.findExisting(ctx, lookupFields, record);
    }

    async validate(
        _ctx: RequestContext,
        record: FacetInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const builder = new ValidationBuilder()
            .requireStringForCreate('name', record.name, operation, 'Facet name is required')
            .requireStringForCreate('code', record.code, operation, 'Facet code is required');

        if (
            (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) &&
            record.code && typeof record.code === 'string' && record.code.trim() !== '' &&
            !/^[a-z0-9_-]+$/i.test(record.code)
        ) {
            builder.addError(
                'code',
                'Code must contain only letters, numbers, hyphens, and underscores',
                'INVALID_FORMAT',
            );
        }

        return builder.build();
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
