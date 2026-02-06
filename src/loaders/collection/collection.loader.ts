import { Injectable } from '@nestjs/common';
import {
    ID,
    Collection,
    RequestContext,
    TransactionalConnection,
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
import { VendureEntityType, TARGET_OPERATION } from '../../constants/enums';
import { BaseEntityLoader, ExistingEntityLookupResult, LoaderMetadata } from '../base';
import {
    CollectionInput,
    ConfigurableOperationInput,
    COLLECTION_LOADER_METADATA,
} from './types';
import {
    sortByHierarchy,
    findParentCollection,
    resolveParentId,
    buildFilterOperation,
    slugify,
    shouldUpdateField,
} from './helpers';

/**
 * CollectionLoader - Refactored to extend BaseEntityLoader
 *
 * This eliminates ~60 lines of duplicate load() method code that was
 * copy-pasted across all loaders. The base class handles:
 * - Result initialization
 * - Validation loop
 * - Duplicate detection
 * - CREATE/UPDATE/UPSERT operation logic
 * - Dry run mode
 * - Error handling
 *
 * Note: Uses preprocessRecords() to sort by hierarchy before processing.
 */
@Injectable()
export class CollectionLoader extends BaseEntityLoader<CollectionInput, Collection> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = COLLECTION_LOADER_METADATA;

    constructor(
        private connection: TransactionalConnection,
        private collectionService: CollectionService,
        private assetService: AssetService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.COLLECTION_LOADER);
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
        // Primary lookup: by slug
        if (record.slug && lookupFields.includes('slug')) {
            const collections = await this.collectionService.findAll(ctx, {
                filter: { slug: { eq: record.slug } },
            });
            if (collections.totalItems > 0) {
                return { id: collections.items[0].id, entity: collections.items[0] };
            }
        }

        // Fallback: by ID
        if (record.id && lookupFields.includes('id')) {
            const collection = await this.collectionService.findOne(ctx, record.id as ID);
            if (collection) {
                return { id: collection.id, entity: collection };
            }
        }

        // Fallback: by name (exact match)
        if (record.name && lookupFields.includes('name')) {
            const collections = await this.collectionService.findAll(ctx, {
                filter: { name: { eq: record.name } },
            });
            if (collections.totalItems > 0) {
                return { id: collections.items[0].id, entity: collections.items[0] };
            }
        }

        return null;
    }

    async validate(
        ctx: RequestContext,
        record: CollectionInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const errors: { field: string; message: string; code?: string }[] = [];
        const warnings: { field: string; message: string }[] = [];

        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
            if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
                errors.push({ field: 'name', message: 'Collection name is required', code: 'REQUIRED' });
            }
        }

        if (record.parentSlug || record.parentId) {
            const parent = await findParentCollection(ctx, this.collectionService, record);
            if (!parent) {
                warnings.push({
                    field: 'parent',
                    message: `Parent collection not found, will create at root level`,
                });
            }
        }

        if (record.position !== undefined && record.position < 0) {
            errors.push({ field: 'position', message: 'Position must be non-negative', code: 'INVALID_VALUE' });
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
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
                filters.push(buildFilterOperation(filter));
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

        if (record.filters && shouldUpdateField('filters', options.updateOnlyFields)) {
            updateInput.filters = record.filters.map(f => buildFilterOperation(f));
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

        this.logger.debug(`Updated collection ${record.name} (ID: ${collectionId})`);
    }
}
