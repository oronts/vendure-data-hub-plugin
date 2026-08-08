import { Injectable } from '@nestjs/common';
import {
    ID,
    ListQueryBuilder,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { In } from 'typeorm';
import { Pipeline } from '../../entities/pipeline';
import { SCHEDULER } from '../../constants';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { sanitizePipelineDefinitionForOutput } from '../validation/hook-security';
import {
    loadActivePipelineDefinitions,
    loadActivePipelineDefinitionsAcrossChannels,
} from './active-pipeline-definitions';
import { getPipelineDependencies } from './pipeline-dependency-graph';
import {
    extractPipelineCapabilityFilters,
    pipelineMatchesCapabilityFilters,
} from './pipeline-capability-filter';
import type { PipelineListOptions } from './pipeline-management-types';

function toPublicPipeline(pipeline: Pipeline): Pipeline {
    const sanitized = Object.assign(new Pipeline(), pipeline);
    sanitized.definition = sanitizePipelineDefinitionForOutput(pipeline.definition);
    return sanitized;
}

@Injectable()
export class PipelineQueryService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private registry: DataHubRegistryService,
    ) {}

    async findAll(
        ctx: RequestContext,
        options?: PipelineListOptions,
    ): Promise<PaginatedList<Pipeline>> {
        const extracted = extractPipelineCapabilityFilters(options);
        const standardOptions = extracted.options as ListQueryOptions<Pipeline>;
        if (extracted.predicates.length === 0) {
            const qb = this.listQueryBuilder.build(Pipeline, standardOptions, {
                ctx,
                channelId: ctx.channelId,
            });
            const [items, totalItems] = await qb.getManyAndCount();
            return { items: items.map(toPublicPipeline), totalItems };
        }

        const candidateQb = this.listQueryBuilder.build(Pipeline, {
            ...standardOptions,
            skip: 0,
            take: SCHEDULER.MAX_PIPELINE_DISCOVERY + 1,
        }, {
            ctx,
            channelId: ctx.channelId,
            ignoreQueryLimits: true,
        });
        const [candidates, candidateTotal] = await candidateQb.getManyAndCount();
        if (
            candidateTotal > SCHEDULER.MAX_PIPELINE_DISCOVERY
            || candidates.length > SCHEDULER.MAX_PIPELINE_DISCOVERY
        ) {
            throw new Error(
                `Capability filtering exceeded the safe limit of ${SCHEDULER.MAX_PIPELINE_DISCOVERY} pipelines`,
            );
        }

        const matchingIds = candidates
            .filter(pipeline => pipelineMatchesCapabilityFilters(
                this.registry,
                pipeline,
                extracted.predicates,
            ))
            .map(pipeline => pipeline.id);
        if (matchingIds.length === 0) {
            return { items: [], totalItems: 0 };
        }

        const qb = this.listQueryBuilder.build(Pipeline, standardOptions, {
            ctx,
            channelId: ctx.channelId,
            where: { id: In(matchingIds) },
        });
        const [items, totalItems] = await qb.getManyAndCount();
        return { items: items.map(toPublicPipeline), totalItems };
    }

    async findOne(ctx: RequestContext, id: ID): Promise<Pipeline | null> {
        const pipeline = await this.connection.findOneInChannel(
            ctx,
            Pipeline,
            id,
            ctx.channelId,
            { relations: ['channels'] },
        );
        return pipeline ? toPublicPipeline(pipeline) : null;
    }

    async findByCodes(ctx: RequestContext, codes: string[]): Promise<Pipeline[]> {
        if (!codes?.length) return [];
        const pipelines = await this.connection.getRepository(ctx, Pipeline)
            .createQueryBuilder('pipeline')
            .innerJoin('pipeline.channels', 'channel', 'channel.id = :channelId', {
                channelId: ctx.channelId,
            })
            .where('pipeline.code IN (:...codes)', { codes })
            .getMany();
        return pipelines.map(toPublicPipeline);
    }

    findByCode(ctx: RequestContext, code: string): Promise<Pipeline | null> {
        return this.connection.getRepository(ctx, Pipeline).findOne({
            where: { code, channels: { id: ctx.channelId } },
        });
    }

    async findDependents(
        ctx: RequestContext,
        code: string,
        acrossChannels = false,
    ): Promise<Pipeline[]> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const candidates = await repo.find({
            where: acrossChannels ? {} : { channels: { id: ctx.channelId } },
            take: SCHEDULER.MAX_PIPELINE_DISCOVERY + 1,
        });
        if (candidates.length > SCHEDULER.MAX_PIPELINE_DISCOVERY) {
            throw new Error(
                `Pipeline dependency discovery exceeded the safe limit of ${SCHEDULER.MAX_PIPELINE_DISCOVERY}`,
            );
        }
        const activeDefinitions = acrossChannels
            ? await loadActivePipelineDefinitionsAcrossChannels(this.connection, ctx)
            : await loadActivePipelineDefinitions(this.connection, ctx);
        const activeById = new Map(
            activeDefinitions.map(pipeline => [String(pipeline.id), pipeline.definition]),
        );
        return candidates
            .filter(pipeline => (
                getPipelineDependencies(pipeline.definition).includes(code)
                || getPipelineDependencies(activeById.get(String(pipeline.id))).includes(code)
            ))
            .map(toPublicPipeline);
    }

    getInActiveChannel(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<Pipeline> {
        return this.connection.getEntityOrThrow(ctx, Pipeline, pipelineId, {
            channelId: ctx.channelId,
        });
    }
}
