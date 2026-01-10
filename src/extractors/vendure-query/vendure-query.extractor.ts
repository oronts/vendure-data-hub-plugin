import { Injectable } from '@nestjs/common';
import { ID, TransactionalConnection } from '@vendure/core';
import { BATCH, LOGGER_CONTEXTS } from '../../constants/index';
import {
    DataExtractor,
    ExtractorContext,
    ExtractorValidationResult,
    RecordEnvelope,
    StepConfigSchema,
    ExtractorCategory,
    ExtractorPreviewResult,
} from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { VendureQueryExtractorConfig } from './types';
import { getEntityClass, applyFilter, entityToRecord, EntityLike } from './helpers';

interface EntityWithMeta {
    id: ID;
    updatedAt?: Date;
}

@Injectable()
export class VendureQueryExtractor implements DataExtractor<VendureQueryExtractorConfig> {
    readonly type = 'extractor' as const;
    readonly code = 'vendure-query';
    readonly name = 'Vendure Entity Extractor';
    readonly description = 'Extract data from Vendure entities for export or sync';
    readonly category: ExtractorCategory = 'vendure';
    readonly version = '1.0.0';
    readonly icon = 'database';
    readonly supportsPagination = true;
    readonly supportsIncremental = true;
    readonly supportsCancellation = true;

    private readonly _logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this._logger = loggerFactory.createLogger(LOGGER_CONTEXTS.VENDURE_QUERY_EXTRACTOR);
    }

    readonly schema: StepConfigSchema = {
        fields: [
            {
                key: 'entity',
                label: 'Entity Type',
                description: 'Vendure entity to extract',
                type: 'select',
                required: true,
                options: [
                    { value: 'Product', label: 'Products' },
                    { value: 'ProductVariant', label: 'Product Variants' },
                    { value: 'Customer', label: 'Customers' },
                    { value: 'Order', label: 'Orders' },
                    { value: 'Collection', label: 'Collections' },
                    { value: 'Facet', label: 'Facets' },
                    { value: 'FacetValue', label: 'Facet Values' },
                    { value: 'Promotion', label: 'Promotions' },
                    { value: 'Asset', label: 'Assets' },
                ],
            },
            {
                key: 'relations',
                label: 'Relations',
                description: 'Relations to include (comma-separated)',
                type: 'string',
                placeholder: 'variants,featuredAsset,translations',
            },
            {
                key: 'batchSize',
                label: 'Batch Size',
                description: 'Number of records per batch',
                type: 'number',
                defaultValue: BATCH.BULK_SIZE,
            },
            {
                key: 'sortBy',
                label: 'Sort By',
                description: 'Field to sort by',
                type: 'string',
                defaultValue: 'createdAt',
            },
            {
                key: 'sortOrder',
                label: 'Sort Order',
                type: 'select',
                options: [
                    { value: 'ASC', label: 'Ascending' },
                    { value: 'DESC', label: 'Descending' },
                ],
                defaultValue: 'ASC',
            },
        ],
    };

    async *extract(
        context: ExtractorContext,
        config: VendureQueryExtractorConfig,
    ): AsyncGenerator<RecordEnvelope, void, undefined> {
        const startTime = Date.now();
        let totalFetched = 0;
        let offset = 0;
        const batchSize = config.batchSize || BATCH.BULK_SIZE;

        try {
            context.logger.info('Starting Vendure entity extraction', {
                entity: config.entity,
                batchSize,
            });

            const entityClass = getEntityClass(config.entity);
            if (!entityClass) {
                throw new Error(`Unknown entity type: ${config.entity}`);
            }

            const repo = this.connection.getRepository(context.ctx, entityClass);
            const relations = config.relations || [];

            let hasMore = true;

            while (hasMore) {
                if (await context.isCancelled()) {
                    context.logger.warn('Extraction cancelled');
                    break;
                }

                const queryBuilder = repo.createQueryBuilder('entity');

                for (const relation of relations) {
                    queryBuilder.leftJoinAndSelect(`entity.${relation}`, relation);
                }

                if (config.filters) {
                    for (const filter of config.filters) {
                        applyFilter(queryBuilder, filter);
                    }
                }

                if (config.where) {
                    queryBuilder.andWhere(config.where);
                }

                const sortBy = config.sortBy || 'createdAt';
                const sortOrder = config.sortOrder || 'ASC';
                queryBuilder.orderBy(`entity.${sortBy}`, sortOrder);

                queryBuilder.skip(offset).take(batchSize);

                const entities = await queryBuilder.getMany();

                if (entities.length === 0) {
                    hasMore = false;
                    break;
                }

                for (const entity of entities) {
                    const record = entityToRecord(entity as unknown as EntityLike, config);
                    const entityMeta = entity as unknown as EntityWithMeta;
                    yield {
                        data: record,
                        meta: {
                            sourceId: `vendure:${config.entity}:${entityMeta.id}`,
                            sourceTimestamp: entityMeta.updatedAt?.toISOString() || new Date().toISOString(),
                            sequence: totalFetched,
                        },
                    };
                    totalFetched++;
                }

                offset += entities.length;
                hasMore = entities.length >= batchSize;

                context.logger.debug(`Fetched batch`, {
                    count: entities.length,
                    totalFetched,
                    offset,
                });
            }

            const durationMs = Date.now() - startTime;
            context.logger.info('Vendure entity extraction completed', {
                entity: config.entity,
                totalFetched,
                durationMs,
            });

            context.setCheckpoint({
                lastExtractedAt: new Date().toISOString(),
                totalFetched,
                lastOffset: offset,
            });
        } catch (error) {
            context.logger.error('Vendure entity extraction failed', error as Error);
            throw error;
        }
    }

    async validate(
        _context: ExtractorContext,
        config: VendureQueryExtractorConfig,
    ): Promise<ExtractorValidationResult> {
        const errors: Array<{ field: string; message: string }> = [];

        if (!config.entity) {
            errors.push({ field: 'entity', message: 'Entity type is required' });
        } else {
            const entityClass = getEntityClass(config.entity);
            if (!entityClass) {
                errors.push({ field: 'entity', message: `Unknown entity type: ${config.entity}` });
            }
        }

        if (config.batchSize && config.batchSize <= 0) {
            errors.push({ field: 'batchSize', message: 'Batch size must be positive' });
        }

        return { valid: errors.length === 0, errors };
    }

    async preview(
        context: ExtractorContext,
        config: VendureQueryExtractorConfig,
        limit: number = 10,
    ): Promise<ExtractorPreviewResult> {
        const entityClass = getEntityClass(config.entity);
        if (!entityClass) {
            throw new Error(`Unknown entity type: ${config.entity}`);
        }

        const repo = this.connection.getRepository(context.ctx, entityClass);
        const entities = await repo.find({
            take: limit,
            relations: config.relations,
        });

        return {
            records: entities.map((entity, index) => {
                const entityMeta = entity as unknown as EntityWithMeta;
                return {
                    data: entityToRecord(entity as unknown as EntityLike, config),
                    meta: {
                        sourceId: `vendure:${config.entity}:${entityMeta.id}`,
                        sequence: index,
                    },
                };
            }),
            totalAvailable: await repo.count(),
        };
    }
}
