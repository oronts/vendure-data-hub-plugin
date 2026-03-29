import { Injectable } from '@nestjs/common';
import {
    ID,
    Collection,
    RequestContext,
    CollectionService,
    AssetService,
} from '@vendure/core';
import {
    LoaderContext,
    EntityValidationResult,
    EntityFieldSchema,
    TargetOperation,
} from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { VendureEntityType } from '../../constants/enums';
import {
    BaseEntityLoader,
    ExistingEntityLookupResult,
    LoaderMetadata,
    ValidationBuilder,
    EntityLookupHelper,
    createLookupHelper,
} from '../base';
import {
    CollectionInput,
    ConfigurableOperationInput,
    COLLECTION_LOADER_METADATA,
} from './types';
import {
    sortByHierarchy,
    findParentCollection,
    resolveParentId,
    buildConfigurableOperation,
    slugify,
    shouldUpdateField,
    handleCollectionFilters,
} from './helpers';
import { handleAssets } from '../shared-helpers';
import type { CollectionUpsertLoaderConfig } from '../../../shared/types';

/** Loads Collection entities via CollectionService. Supports CREATE, UPDATE, UPSERT. */
@Injectable()
export class CollectionLoader extends BaseEntityLoader<CollectionInput, Collection> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = COLLECTION_LOADER_METADATA;

    private readonly lookupHelper: EntityLookupHelper<CollectionService, Collection, CollectionInput>;

    constructor(
        private collectionService: CollectionService,
        private assetService: AssetService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.COLLECTION_LOADER);
        this.lookupHelper = createLookupHelper<CollectionService, Collection, CollectionInput>(this.collectionService)
            .addFilterStrategy('slug', 'slug', (ctx, svc, opts) => svc.findAll(ctx, opts))
            .addIdStrategy((ctx, svc, id) => svc.findOne(ctx, id))
            .addFilterStrategy('name', 'name', (ctx, svc, opts) => svc.findAll(ctx, opts));
    }

    /**
     * Sort collections by hierarchy depth so parents are created before children
     */
    protected preprocessRecords(records: CollectionInput[]): CollectionInput[] {
        return sortByHierarchy(records);
    }

    protected getDuplicateErrorMessage(record: CollectionInput): string {
        return `Collection with slug "${record.slug}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: CollectionInput,
    ): Promise<ExistingEntityLookupResult<Collection> | null> {
        return this.lookupHelper.findExisting(ctx, lookupFields, record);
    }

    async validate(
        ctx: RequestContext,
        record: CollectionInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const identifier = record.slug || record.name || record.id || 'unknown';

        const builder = new ValidationBuilder()
            .withIdentifier(`slug="${identifier}"`)
            .withLineNumber(ValidationBuilder.getLineNumber(record as Record<string, unknown>))
            .requireStringForCreate('name', record.name, operation, 'Collection name is required');

        if (record.parentSlug || record.parentId) {
            const parent = await findParentCollection(ctx, this.collectionService, record);
            if (!parent) {
                builder.addWarning('parent', 'Parent collection not found, will create at root level');
            }
        }

        builder.addErrorIf(
            record.position !== undefined && record.position < 0,
            'position',
            'Position must be non-negative',
            'INVALID_VALUE',
        );

        return builder.build();
    }

    getFieldSchema(): EntityFieldSchema {
        return {
            entityType: VendureEntityType.COLLECTION,
            fields: [
                {
                    key: 'name',
                    label: 'Collection Name',
                    type: 'string',
                    required: true,
                    translatable: true,
                    description: 'Display name for the collection',
                    example: 'Electronics',
                },
                {
                    key: 'slug',
                    label: 'URL Slug',
                    type: 'string',
                    lookupable: true,
                    description: 'URL-friendly identifier (auto-generated if not provided)',
                    example: 'electronics',
                },
                {
                    key: 'description',
                    label: 'Description',
                    type: 'string',
                    translatable: true,
                    description: 'Collection description (HTML supported)',
                },
                {
                    key: 'parentSlug',
                    label: 'Parent Collection Slug',
                    type: 'string',
                    description: 'Slug of parent collection (for hierarchy)',
                    example: 'home-and-garden',
                },
                {
                    key: 'parentId',
                    label: 'Parent Collection ID',
                    type: 'string',
                    description: 'ID of parent collection',
                },
                {
                    key: 'position',
                    label: 'Position',
                    type: 'number',
                    description: 'Sort order within parent (0 = first)',
                    example: 0,
                },
                {
                    key: 'isPrivate',
                    label: 'Private',
                    type: 'boolean',
                    description: 'Whether collection is hidden from customers',
                },
                {
                    key: 'filters',
                    label: 'Product Filters',
                    type: 'array',
                    description: 'Filter rules for automatic product assignment',
                },
                {
                    key: 'assetUrls',
                    label: 'Asset URLs',
                    type: 'array',
                    description: 'URLs of images to attach',
                },
                {
                    key: 'featuredAssetUrl',
                    label: 'Featured Asset URL',
                    type: 'string',
                    description: 'URL of the featured/main image',
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

    protected async createEntity(context: LoaderContext, record: CollectionInput): Promise<ID | null> {
        const { ctx } = context;

        const slug = record.slug || slugify(record.name);
        const parentId = await resolveParentId(ctx, this.collectionService, record);

        const filters: ConfigurableOperationInput[] = [];
        if (record.filters && Array.isArray(record.filters)) {
            for (const filter of record.filters) {
                filters.push(buildConfigurableOperation(filter));
            }
        }

        const collection = await this.collectionService.create(ctx, {
            parentId,
            isPrivate: record.isPrivate ?? false,
            filters,
            translations: [
                {
                    languageCode: ctx.languageCode,
                    name: record.name,
                    slug,
                    description: record.description || '',
                },
            ],
            customFields: record.customFields as Record<string, unknown>,
        });

        if (record.position !== undefined && record.position >= 0) {
            try {
                await this.collectionService.move(ctx, {
                    collectionId: collection.id,
                    parentId: parentId ?? collection.parent?.id,
                    index: record.position,
                });
            } catch (error) {
                this.logger.warn(`Could not set position for collection ${slug}: ${error}`);
            }
        }

        // Handle assets with mode (default: UPSERT_BY_URL for create)
        if (record.assetUrls && record.assetUrls.length > 0) {
            const assetsMode = (context.options.config as unknown as CollectionUpsertLoaderConfig)?.assetsMode ?? 'UPSERT_BY_URL';
            await handleAssets(
                ctx,
                this.assetService,
                this.collectionService,
                collection.id,
                record.assetUrls,
                assetsMode,
                this.logger,
            );
        }

        this.logger.log(`Created collection ${record.name} (ID: ${collection.id})`);
        return collection.id;
    }

    protected async updateEntity(context: LoaderContext, collectionId: ID, record: CollectionInput): Promise<void> {
        const { ctx, options } = context;

        const updateInput: Record<string, unknown> = { id: collectionId };

        const translations: Array<Record<string, unknown>> = [];
        if ((record.name !== undefined && shouldUpdateField('name', options.updateOnlyFields)) ||
            (record.slug !== undefined && shouldUpdateField('slug', options.updateOnlyFields)) ||
            (record.description !== undefined && shouldUpdateField('description', options.updateOnlyFields))) {
            translations.push({
                languageCode: ctx.languageCode,
                name: record.name,
                slug: record.slug,
                description: record.description,
            });
        }
        if (translations.length > 0) {
            updateInput.translations = translations;
        }

        if (record.isPrivate !== undefined && shouldUpdateField('isPrivate', options.updateOnlyFields)) {
            updateInput.isPrivate = record.isPrivate;
        }
        if (record.customFields !== undefined && shouldUpdateField('customFields', options.updateOnlyFields)) {
            updateInput.customFields = record.customFields;
        }

        // Handle filters with mode
        if (record.filters && shouldUpdateField('filters', options.updateOnlyFields)) {
            const filtersMode = (options.config as unknown as CollectionUpsertLoaderConfig)?.filtersMode ?? 'REPLACE_ALL';
            if (filtersMode === 'SKIP') {
                // Don't update filters
            } else {
                const filters = await handleCollectionFilters(
                    ctx,
                    this.collectionService,
                    collectionId,
                    record.filters,
                    filtersMode,
                    this.logger,
                );
                if (filters.length > 0 || filtersMode === 'REPLACE_ALL') {
                    updateInput.filters = filters;
                }
            }
        }

        await this.collectionService.update(ctx, updateInput as Parameters<typeof this.collectionService.update>[1]);

        if ((record.parentSlug || record.parentId) && shouldUpdateField('parent', options.updateOnlyFields)) {
            const newParentId = await resolveParentId(ctx, this.collectionService, record);
            if (newParentId) {
                await this.collectionService.move(ctx, {
                    collectionId,
                    parentId: newParentId,
                    index: record.position ?? 0,
                });
            }
        }

        // Handle assets with mode (default: UPSERT_BY_URL for update)
        if (record.assetUrls && record.assetUrls.length > 0 && shouldUpdateField('assetUrls', options.updateOnlyFields)) {
            const assetsMode = (options.config as unknown as CollectionUpsertLoaderConfig)?.assetsMode ?? 'UPSERT_BY_URL';
            await handleAssets(
                ctx,
                this.assetService,
                this.collectionService,
                collectionId,
                record.assetUrls,
                assetsMode,
                this.logger,
            );
        }

        this.logger.debug(`Updated collection ${record.name} (ID: ${collectionId})`);
    }
}
