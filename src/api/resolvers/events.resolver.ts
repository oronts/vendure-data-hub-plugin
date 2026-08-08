import { Args, Query, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { In } from 'typeorm';
import { DataHubPipelinePermission } from '../../permissions';
import { DomainEventsService, type BufferedEvent } from '../../services';
import {
    DataHubWebhookDelivery,
    Pipeline,
    PipelineRun,
} from '../../entities/pipeline';
import { PAGINATION } from '../../constants/index';

interface EventOwnership {
    readonly channelId?: string;
    readonly pipelineId?: string;
    readonly runId?: string;
    readonly deliveryId?: string;
}

@Resolver()
export class DataHubEventsAdminResolver {
    constructor(
        private events: DomainEventsService,
        private connection: TransactionalConnection,
    ) {}

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    async dataHubEvents(
        @Ctx() ctx: RequestContext,
        @Args() args: { limit?: number },
    ): Promise<BufferedEvent[]> {
        const events = this.events.list(args?.limit ?? PAGINATION.EVENTS_LIMIT);
        const ownership = events.map(event => this.getOwnership(event));
        const runIds = this.uniqueIdentifiers(ownership.map(value => value.runId));
        const pipelineIds = this.uniqueIdentifiers(ownership.map(value => value.pipelineId));
        const deliveryIds = this.uniqueIdentifiers(ownership.map(value => value.deliveryId));
        const [accessibleRuns, accessiblePipelines, accessibleDeliveries] = await Promise.all([
            this.findAccessibleRunIds(ctx, runIds),
            this.findAccessiblePipelineIds(ctx, pipelineIds),
            this.findAccessibleDeliveryIds(ctx, deliveryIds),
        ]);
        const activeChannelId = String(ctx.channelId);

        return events.filter((event, index) => {
            const eventOwnership = ownership[index];
            let hasOwnership = false;
            if (eventOwnership.channelId !== undefined) {
                hasOwnership = true;
                if (eventOwnership.channelId !== activeChannelId) return false;
            }
            if (eventOwnership.runId !== undefined) {
                hasOwnership = true;
                if (!accessibleRuns.has(eventOwnership.runId)) return false;
            }
            if (eventOwnership.deliveryId !== undefined) {
                hasOwnership = true;
                if (!accessibleDeliveries.has(eventOwnership.deliveryId)) return false;
            }
            if (eventOwnership.pipelineId !== undefined) {
                hasOwnership = true;
                if (!accessiblePipelines.has(eventOwnership.pipelineId)) return false;
            }
            return hasOwnership;
        });
    }

    private getOwnership(event: BufferedEvent): EventOwnership {
        const payload = event.payload ?? {};
        return {
            channelId: this.asIdentifier(payload.channelId),
            pipelineId: this.asIdentifier(payload.pipelineId),
            runId: this.asIdentifier(payload.runId),
            deliveryId: this.asIdentifier(payload.deliveryId),
        };
    }

    private asIdentifier(value: unknown): string | undefined {
        return typeof value === 'string' || typeof value === 'number'
            ? String(value)
            : undefined;
    }

    private uniqueIdentifiers(values: Array<string | undefined>): string[] {
        return [...new Set(values.filter((value): value is string => value !== undefined))];
    }

    private async findAccessibleRunIds(
        ctx: RequestContext,
        runIds: string[],
    ): Promise<Set<string>> {
        if (runIds.length === 0) return new Set();
        const runs = await this.connection.getRepository(ctx, PipelineRun).find({
            where: {
                id: In(runIds),
                channelId: String(ctx.channelId),
            },
            select: { id: true },
        });
        return new Set(runs.map(run => String(run.id)));
    }

    private async findAccessiblePipelineIds(
        ctx: RequestContext,
        pipelineIds: string[],
    ): Promise<Set<string>> {
        if (pipelineIds.length === 0) return new Set();
        const pipelines = await this.connection.getRepository(ctx, Pipeline)
            .createQueryBuilder('pipeline')
            .innerJoin('pipeline.channels', 'channel', 'channel.id = :channelId', {
                channelId: ctx.channelId,
            })
            .where('pipeline.id IN (:...pipelineIds)', { pipelineIds })
            .select('pipeline.id')
            .getMany();
        return new Set(pipelines.map(pipeline => String(pipeline.id)));
    }

    private async findAccessibleDeliveryIds(
        ctx: RequestContext,
        deliveryIds: string[],
    ): Promise<Set<string>> {
        if (deliveryIds.length === 0) return new Set();
        const deliveries = await this.connection
            .getRepository(ctx, DataHubWebhookDelivery)
            .find({
                where: {
                    id: In(deliveryIds),
                    channelId: String(ctx.channelId),
                },
                select: { id: true },
            });
        return new Set(deliveries.map(delivery => String(delivery.id)));
    }
}
