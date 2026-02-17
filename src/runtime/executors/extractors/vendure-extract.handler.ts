/**
 * Vendure Entity Extract Handler
 *
 * Extracts records from Vendure entities with support for:
 * - TypeORM relations (single and two-level)
 * - Filtering with various operators
 * - Pagination with offset
 * - Sorting
 *
 * @module runtime/executors/extractors
 */

import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { SortOrder } from '../../../constants/index';
import { RecordObject } from '../../executor-types';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';
import { BATCH, LOGGER_CONTEXTS } from '../../../constants/index';
import { getEntityClass, entityToRecord, EntityLike, validateFieldName } from '../../../extractors/vendure-query/helpers';
import { escapeLikePattern } from '../../../utils/sql-security.utils';
import { VendureQueryExtractorConfig } from '../../../extractors/vendure-query/types';
import {
    ExtractHandler,
    ExtractHandlerContext,
    getExtractConfig,
    updateCheckpoint,
    getCheckpointValue,
} from './extract-handler.interface';
import { getErrorMessage } from '../../../utils/error.utils';

interface VendureExtractConfig {
    entity?: string;
    batchSize?: number;
    relations?: string | string[];
    sortBy?: string;
    sortOrder?: SortOrder;
    filters?: Array<{
        field: string;
        operator: string;
        value: unknown;
    }>;
    where?: Record<string, unknown>;
    /** Fields to include */
    includeFields?: string[];
    /** Fields to exclude */
    excludeFields?: string[];
    /** Language code for translations */
    languageCode?: string;
    /** Flatten translations into root object */
    flattenTranslations?: boolean;
}

type FilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like' | 'contains';

@Injectable()
export class VendureExtractHandler implements ExtractHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EXTRACT_EXECUTOR);
    }

    async extract(context: ExtractHandlerContext): Promise<RecordObject[]> {
        const { ctx, step, executorCtx, onRecordError } = context;
        const cfg = getExtractConfig<VendureExtractConfig>(step);

        this.logger.info('vendureQuery: starting extraction', {
            stepKey: step.key,
            entity: cfg.entity,
            config: JSON.stringify(cfg),
        });

        const entityType = cfg.entity;
        if (!entityType) {
            this.logger.warn('vendureQuery: missing entity type', { stepKey: step.key });
            return [];
        }

        const entityClass = getEntityClass(entityType);
        if (!entityClass) {
            await this.reportError(onRecordError, step.key, `Unknown entity type: ${entityType}`, { entity: entityType });
            return [];
        }

        const relations = this.parseRelations(cfg.relations);
        const validationError = this.validateRelations(relations, entityType);
        if (validationError) {
            await this.reportError(onRecordError, step.key, validationError, { entity: entityType });
            return [];
        }

        try {
            return await this.executeQuery(ctx, step, executorCtx, cfg, entityClass, relations);
        } catch (error) {
            const errorMsg = this.formatQueryError(error, entityType);
            this.logger.error('vendureQuery: extraction failed', error as Error, { stepKey: step.key, entity: entityType });
            await this.reportError(onRecordError, step.key, errorMsg, { entity: entityType });
            return [];
        }
    }

    private parseRelations(relations?: string | string[]): string[] {
        if (!relations) return [];
        if (typeof relations === 'string' && relations.trim()) {
            return relations.split(',').map(r => r.trim()).filter(Boolean);
        }
        if (Array.isArray(relations)) return relations;
        return [];
    }

    private validateRelations(relations: string[], _entityType: string): string | null {
        const tooDeepRelations = relations.filter(r => (r.match(/\./g) || []).length > 1);
        if (tooDeepRelations.length > 0) {
            return `Relations with 3+ levels are not supported: ${tooDeepRelations.join(', ')}. ` +
                `Use relations like 'variants.translations' (2 levels max).`;
        }
        return null;
    }

    private async executeQuery(
        ctx: RequestContext,
        step: { key: string; config?: unknown },
        executorCtx: import('../../executor-types').ExecutorContext,
        cfg: VendureExtractConfig,
        entityClass: NonNullable<ReturnType<typeof getEntityClass>>,
        relations: string[],
    ): Promise<RecordObject[]> {
        const repo = this.connection.getRepository(ctx, entityClass);
        const totalCount = await repo.count();
        this.logger.info('vendureQuery: total entities in table', { stepKey: step.key, entity: cfg.entity, totalCount });

        const batchSize = Number(cfg.batchSize) || BATCH.SIZE;
        const offset = getCheckpointValue(executorCtx, step.key, 'offset', 0);
        this.logger.info('vendureQuery: using offset', { stepKey: step.key, offset, batchSize, totalCount });

        const queryBuilder = repo.createQueryBuilder('entity');
        this.addRelations(queryBuilder, relations);
        this.addFilters(queryBuilder, cfg.filters);
        this.addWhereClause(queryBuilder, cfg.where);
        this.addSortingAndPagination(queryBuilder, cfg, offset, batchSize);

        const entities = await queryBuilder.getMany();
        this.logger.debug('vendureQuery: fetched entities', {
            stepKey: step.key,
            entity: cfg.entity,
            count: entities.length,
            offset,
            batchSize,
        });

        const results = entities.map(entity => entityToRecord(entity as unknown as EntityLike, cfg as VendureQueryExtractorConfig));
        updateCheckpoint(executorCtx, step.key, { offset: offset + entities.length });

        return results as RecordObject[];
    }

    private addRelations(queryBuilder: SelectQueryBuilder<ObjectLiteral>, relations: string[]): void {
        const addedAliases = new Set<string>();

        for (const relation of relations) {
            if (relation.includes('.')) {
                this.addNestedRelation(queryBuilder, relation, addedAliases);
            } else {
                this.addSingleRelation(queryBuilder, relation, addedAliases);
            }
        }
    }

    private addNestedRelation(
        queryBuilder: SelectQueryBuilder<ObjectLiteral>,
        relation: string,
        addedAliases: Set<string>,
    ): void {
        const [parent, child] = relation.split('.');
        if (!validateFieldName(parent) || !validateFieldName(child)) {
            throw new Error(`Invalid relation name: ${relation}`);
        }
        const parentAlias = parent;
        const childAlias = `${parent}_${child}`;

        if (!addedAliases.has(parentAlias)) {
            queryBuilder.leftJoinAndSelect(`entity.${parent}`, parentAlias);
            addedAliases.add(parentAlias);
        }
        queryBuilder.leftJoinAndSelect(`${parentAlias}.${child}`, childAlias);
        addedAliases.add(childAlias);
    }

    private addSingleRelation(
        queryBuilder: SelectQueryBuilder<ObjectLiteral>,
        relation: string,
        addedAliases: Set<string>,
    ): void {
        if (!validateFieldName(relation)) {
            throw new Error(`Invalid relation name: ${relation}`);
        }
        if (!addedAliases.has(relation)) {
            queryBuilder.leftJoinAndSelect(`entity.${relation}`, relation);
            addedAliases.add(relation);
        }
    }

    private addFilters(queryBuilder: SelectQueryBuilder<ObjectLiteral>, filters?: VendureExtractConfig['filters']): void {
        if (!Array.isArray(filters)) return;

        for (const filter of filters) {
            if (!filter?.field || !filter?.operator) continue;

            const paramName = `filter_${filter.field.replace(/\./g, '_')}`;
            const condition = this.buildFilterCondition(filter.field, filter.operator as FilterOperator, paramName);

            if (condition) {
                const paramValue = this.getFilterParamValue(filter.operator as FilterOperator, filter.value);
                queryBuilder.andWhere(condition, { [paramName]: paramValue });
            }
        }
    }

    private buildFilterCondition(field: string, operator: FilterOperator, paramName: string): string | null {
        if (!validateFieldName(field)) {
            throw new Error(`Invalid field name: ${field}`);
        }

        const operatorMap: Record<FilterOperator, string> = {
            eq: `entity.${field} = :${paramName}`,
            ne: `entity.${field} != :${paramName}`,
            gt: `entity.${field} > :${paramName}`,
            gte: `entity.${field} >= :${paramName}`,
            lt: `entity.${field} < :${paramName}`,
            lte: `entity.${field} <= :${paramName}`,
            in: `entity.${field} IN (:...${paramName})`,
            like: `entity.${field} LIKE :${paramName}`,
            contains: `entity.${field} LIKE :${paramName}`,
        };

        return operatorMap[operator] ?? null;
    }

    private getFilterParamValue(operator: FilterOperator, value: unknown): unknown {
        if (operator === 'like' || operator === 'contains') {
            const escaped = escapeLikePattern(String(value));
            return `%${escaped}%`;
        }
        return value;
    }

    private addWhereClause(queryBuilder: SelectQueryBuilder<ObjectLiteral>, where?: Record<string, unknown>): void {
        if (!where || typeof where !== 'object') return;

        for (const [field, value] of Object.entries(where)) {
            if (!validateFieldName(field)) {
                throw new Error(`Invalid field name in where clause: ${field}`);
            }
            const paramName = `where_${field.replace(/\./g, '_')}`;
            queryBuilder.andWhere(`entity.${field} = :${paramName}`, { [paramName]: value });
        }
    }

    private addSortingAndPagination(
        queryBuilder: SelectQueryBuilder<ObjectLiteral>,
        cfg: VendureExtractConfig,
        offset: number,
        batchSize: number,
    ): void {
        const sortBy = cfg.sortBy || 'createdAt';
        if (!validateFieldName(sortBy)) {
            throw new Error(`Invalid sortBy field name: ${sortBy}`);
        }
        const sortOrder = cfg.sortOrder || SortOrder.ASC;

        queryBuilder.orderBy(`entity.${sortBy}`, sortOrder);
        queryBuilder.skip(offset).take(batchSize);
    }

    private formatQueryError(error: unknown, entityType: string): string {
        const errorMsg = getErrorMessage(error);

        if (errorMsg.includes('Relation with property path') && errorMsg.includes('was not found')) {
            const match = errorMsg.match(/Relation with property path ([^\s]+)/);
            const relationPath = match ? match[1] : 'unknown';
            return `Invalid relation "${relationPath}" for entity "${entityType}". ` +
                `This is likely a deep nested relation. Use only single-level relations (e.g., 'customer', 'lines') ` +
                `and access nested data via the loaded relation properties.`;
        }

        if (errorMsg.includes('is not a function')) {
            return `Query builder error for entity "${entityType}". Check that the entity exists and relations are valid.`;
        }

        return `Vendure query failed: ${errorMsg}`;
    }

    private async reportError(
        onRecordError: ((stepKey: string, message: string, record: RecordObject) => Promise<void>) | undefined,
        stepKey: string,
        message: string,
        context: RecordObject,
    ): Promise<void> {
        this.logger.warn(`vendureQuery: ${message}`, { stepKey, ...context });
        if (onRecordError) {
            await onRecordError(stepKey, message, context);
        }
    }
}
