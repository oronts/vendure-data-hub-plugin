import { Injectable } from '@nestjs/common';
import {
    ID,
    Asset,
    RequestContext,
    TransactionalConnection,
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
    AssetInput,
    ASSET_LOADER_METADATA,
} from './types';
import {
    downloadFile,
    extractFilenameFromUrl,
    getMimeType,
    createReadStreamFromBuffer,
    shouldUpdateField,
} from './helpers';

/**
 * AssetLoader - Refactored to extend BaseEntityLoader
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
 * Note: createEntity returns null when asset download fails,
 * which the base class handles by recording the failure.
 */
@Injectable()
export class AssetLoader extends BaseEntityLoader<AssetInput, Asset> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = ASSET_LOADER_METADATA;

    constructor(
        private connection: TransactionalConnection,
        private assetService: AssetService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.ASSET_LOADER);
    }

    protected getDuplicateErrorMessage(record: AssetInput): string {
        const assetName = record.name || extractFilenameFromUrl(record.sourceUrl);
        return `Asset with name "${assetName}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: AssetInput,
    ): Promise<ExistingEntityLookupResult<Asset> | null> {
        // Primary lookup: by name
        if (record.name && lookupFields.includes('name')) {
            const assets = await this.assetService.findAll(ctx, {
                filter: { name: { eq: record.name } },
            });
            if (assets.totalItems > 0) {
                return { id: assets.items[0].id, entity: assets.items[0] };
            }
        }

        // Fallback: by ID
        if (record.id && lookupFields.includes('id')) {
            const asset = await this.assetService.findOne(ctx, record.id as ID);
            if (asset) {
                return { id: asset.id, entity: asset };
            }
        }

        // Fallback: by source URL
        if (record.sourceUrl && lookupFields.includes('source')) {
            const assets = await this.assetService.findAll(ctx, {
                filter: { source: { contains: extractFilenameFromUrl(record.sourceUrl) } },
            });
            if (assets.totalItems > 0) {
                return { id: assets.items[0].id, entity: assets.items[0] };
            }
        }

        return null;
    }

    async validate(
        _ctx: RequestContext,
        record: AssetInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const errors: { field: string; message: string; code?: string }[] = [];
        const warnings: { field: string; message: string }[] = [];

        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
            if (!record.sourceUrl || typeof record.sourceUrl !== 'string' || record.sourceUrl.trim() === '') {
                errors.push({ field: 'sourceUrl', message: 'Source URL is required', code: 'REQUIRED' });
            } else {
                try {
                    new URL(record.sourceUrl);
                } catch {
                    // URL parsing failed - invalid format
                    errors.push({ field: 'sourceUrl', message: 'Invalid URL format', code: 'INVALID_FORMAT' });
                }
            }
        }

        if (record.focalPoint) {
            if (typeof record.focalPoint.x !== 'number' || record.focalPoint.x < 0 || record.focalPoint.x > 1) {
                errors.push({ field: 'focalPoint.x', message: 'Focal point X must be between 0 and 1', code: 'INVALID_VALUE' });
            }
            if (typeof record.focalPoint.y !== 'number' || record.focalPoint.y < 0 || record.focalPoint.y > 1) {
                errors.push({ field: 'focalPoint.y', message: 'Focal point Y must be between 0 and 1', code: 'INVALID_VALUE' });
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
            entityType: VendureEntityType.ASSET,
            fields: [
                {
                    key: 'sourceUrl',
                    label: 'Source URL',
                    type: 'string',
                    required: true,
                    description: 'URL to download the asset from',
                    example: 'https://example.com/images/product.jpg',
                },
                {
                    key: 'name',
                    label: 'Asset Name',
                    type: 'string',
                    lookupable: true,
                    description: 'Display name for the asset (auto-generated from URL if not provided)',
                    example: 'product-image.jpg',
                },
                {
                    key: 'focalPoint',
                    label: 'Focal Point',
                    type: 'object',
                    description: 'Focal point for image cropping (x, y between 0 and 1)',
                    children: [
                        { key: 'x', label: 'X Position', type: 'number', description: 'Horizontal focal point (0-1)' },
                        { key: 'y', label: 'Y Position', type: 'number', description: 'Vertical focal point (0-1)' },
                    ],
                },
                {
                    key: 'tags',
                    label: 'Tags',
                    type: 'array',
                    description: 'Array of tag names to assign to the asset',
                    example: ['product', 'featured'],
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

    protected async createEntity(context: LoaderContext, record: AssetInput): Promise<ID | null> {
        const { ctx } = context;
        const assetName = record.name || extractFilenameFromUrl(record.sourceUrl);

        try {
            const fileData = await downloadFile(record.sourceUrl);
            if (!fileData) {
                this.logger.warn(`Failed to download ${record.sourceUrl}`);
                return null;
            }

            const mimeType = getMimeType(record.sourceUrl);
            const file = {
                filename: assetName,
                mimetype: mimeType,
                createReadStream: () => createReadStreamFromBuffer(fileData),
            };

            const assetResult = await this.assetService.create(ctx, {
                file,
                tags: record.tags,
                customFields: record.customFields as Record<string, unknown>,
            });

            if ('errorCode' in assetResult) {
                this.logger.error(`Asset creation error: ${assetResult.message}`);
                return null;
            }

            const asset = assetResult;

            if (record.focalPoint) {
                await this.assetService.update(ctx, {
                    id: asset.id,
                    focalPoint: record.focalPoint,
                });
            }

            this.logger.log(`Created asset ${assetName} (ID: ${asset.id})`);
            return asset.id;
        } catch (error) {
            this.logger.error(`Failed to create asset from URL ${record.sourceUrl}: ${error}`);
            return null;
        }
    }

    protected async updateEntity(context: LoaderContext, assetId: ID, record: AssetInput): Promise<void> {
        const { ctx, options } = context;

        const updateInput: Record<string, unknown> = { id: assetId };

        if (record.name !== undefined && shouldUpdateField('name', options.updateOnlyFields)) {
            updateInput.name = record.name;
        }
        if (record.focalPoint !== undefined && shouldUpdateField('focalPoint', options.updateOnlyFields)) {
            updateInput.focalPoint = record.focalPoint;
        }
        if (record.customFields !== undefined && shouldUpdateField('customFields', options.updateOnlyFields)) {
            updateInput.customFields = record.customFields;
        }

        await this.assetService.update(ctx, updateInput as Parameters<typeof this.assetService.update>[1]);

        this.logger.debug(`Updated asset (ID: ${assetId})`);
    }
}
