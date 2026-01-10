import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    AssetService,
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
    AssetInput,
    ExistingEntityResult,
    ASSET_LOADER_METADATA,
} from './types';
import {
    downloadFile,
    extractFilenameFromUrl,
    getMimeType,
    createReadStreamFromBuffer,
    isRecoverableError,
    shouldUpdateField,
} from './helpers';

@Injectable()
export class AssetLoader implements EntityLoader<AssetInput> {
    private readonly logger: DataHubLogger;

    readonly entityType = ASSET_LOADER_METADATA.entityType;
    readonly name = ASSET_LOADER_METADATA.name;
    readonly description = ASSET_LOADER_METADATA.description;
    readonly supportedOperations: TargetOperation[] = [...ASSET_LOADER_METADATA.supportedOperations];
    readonly lookupFields = [...ASSET_LOADER_METADATA.lookupFields];
    readonly requiredFields = [...ASSET_LOADER_METADATA.requiredFields];

    constructor(
        private _connection: TransactionalConnection,
        private assetService: AssetService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.ASSET_LOADER);
    }

    async load(context: LoaderContext, records: AssetInput[]): Promise<EntityLoadResult> {
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

                const assetName = record.name || extractFilenameFromUrl(record.sourceUrl);

                const existing = await this.findExisting(context.ctx, context.lookupFields, { ...record, name: assetName });

                if (existing) {
                    if (context.operation === 'CREATE') {
                        if (context.options.skipDuplicates) {
                            result.skipped++;
                            continue;
                        }
                        result.failed++;
                        result.errors.push({
                            record,
                            message: `Asset with name "${assetName}" already exists`,
                            code: 'DUPLICATE',
                            recoverable: false,
                        });
                        continue;
                    }

                    if (!context.dryRun) {
                        await this.updateAsset(context, existing.id, record);
                    }
                    result.updated++;
                    result.affectedIds.push(existing.id);
                } else {
                    if (context.operation === 'UPDATE') {
                        result.skipped++;
                        continue;
                    }

                    if (!context.dryRun) {
                        const newId = await this.createAsset(context, record, assetName);
                        if (newId) {
                            result.affectedIds.push(newId);
                            result.created++;
                        } else {
                            result.failed++;
                            result.errors.push({
                                record,
                                message: 'Failed to download and create asset',
                                recoverable: true,
                            });
                            continue;
                        }
                    } else {
                        result.created++;
                    }
                }

                result.succeeded++;
            } catch (error) {
                result.failed++;
                result.errors.push({
                    record,
                    message: error instanceof Error ? error.message : String(error),
                    recoverable: isRecoverableError(error),
                });
                this.logger.error(`Failed to load asset`, error instanceof Error ? error : undefined);
            }
        }

        return result;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: AssetInput,
    ): Promise<ExistingEntityResult | null> {
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

        if (operation === 'CREATE' || operation === 'UPSERT') {
            if (!record.sourceUrl || typeof record.sourceUrl !== 'string' || record.sourceUrl.trim() === '') {
                errors.push({ field: 'sourceUrl', message: 'Source URL is required', code: 'REQUIRED' });
            } else {
                try {
                    new URL(record.sourceUrl);
                } catch {
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
            entityType: 'Asset',
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

    private async createAsset(context: LoaderContext, record: AssetInput, assetName: string): Promise<ID | null> {
        const { ctx } = context;

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

    private async updateAsset(context: LoaderContext, assetId: ID, record: AssetInput): Promise<void> {
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
