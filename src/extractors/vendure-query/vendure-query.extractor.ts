import { Injectable } from '@nestjs/common';
import { ID, TransactionalConnection } from '@vendure/core';
import { BATCH, SortOrder } from '../../constants/index';
import {
    DataExtractor,
    ExtractorContext,
    ExtractorValidationResult,
    RecordEnvelope,
    StepConfigSchema,
    ExtractorCategory,
    ExtractorPreviewResult,
} from '../../types/index';
import { VendureQueryExtractorConfig } from './types';
import { getEntityClass, applyFilter, entityToRecord, EntityLike, validateFieldName } from './helpers';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import { VENDURE_QUERY_EXTRACTOR_SCHEMA } from './schema';

interface EntityWithMeta {
    id: ID;
    updatedAt?: Date;
}

@Injectable()
export class VendureQueryExtractor implements DataExtractor<VendureQueryExtractorConfig> {
    readonly type = 'EXTRACTOR' as const;
    readonly code = 'vendureQuery';
    readonly name = 'Vendure Entity Extractor';
    readonly category: ExtractorCategory = 'VENDURE';
    readonly supportsPagination = true;
    readonly supportsIncremental = true;
    readonly supportsCancellation = true;

    constructor(private connection: TransactionalConnection) {}

    readonly schema: StepConfigSchema = VENDURE_QUERY_EXTRACTOR_SCHEMA;

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
                    if (!validateFieldName(relation)) {
                        throw new Error(`Invalid relation name: ${relation}`);
                    }
                    queryBuilder.leftJoinAndSelect(`entity.${relation}`, relation);
                }

                if (config.filters) {
                    for (const filter of config.filters) {
                        applyFilter(queryBuilder, filter);
                    }
                }

                if (config.where) {
                    if (typeof config.where === 'string') {
                        throw new Error('Raw WHERE clauses are not supported. Use config.filters instead.');
                    }
                    if (typeof config.where === 'object') {
                        for (const [field, value] of Object.entries(config.where)) {
                            if (!validateFieldName(field)) {
                                throw new Error(`Invalid field name in where clause: ${field}`);
                            }
                            const paramName = `where_${field.replace(/\./g, '_')}`;
                            queryBuilder.andWhere(`entity.${field} = :${paramName}`, { [paramName]: value });
                        }
                    }
                }

                const sortBy = config.sortBy || 'createdAt';
                if (!validateFieldName(sortBy)) {
                    throw new Error(`Invalid sortBy field name: ${sortBy}`);
                }
                const sortOrder = config.sortOrder || SortOrder.ASC;
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
            context.logger.error('Vendure entity extraction failed', toErrorOrUndefined(error), { error: getErrorMessage(error) });
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
