import { Injectable } from '@nestjs/common';
import {
    assertFound,
    ID,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import {
    Pipeline,
    PipelineRevision,
} from '../../entities/pipeline';
import {
    PipelineStatus,
    SortOrder,
} from '../../constants/enums';
import { DefinitionValidationService } from '../validation/definition-validation.service';
import { DomainEventsService } from '../events/domain-events.service';
import { RevisionService } from '../versioning/revision.service';
import {
    PublishDataHubPipelinePermission,
    ReviewDataHubPipelinePermission,
} from '../../permissions';
import {
    assertPipelineStatus,
} from './pipeline-policy';
import {
    advancePipelineRowVersion,
    createPipelineWriteGuard,
} from './pipeline-write-guard';
import { sanitizePipelineDefinitionForOutput } from '../validation/hook-security';
import { assertDatabaseConfiguration } from '../config/configuration-ownership';
import { loadPublishedPipelineDefinition } from './published-pipeline-definition';
import { PipelineQueryService } from './pipeline-query.service';

function toPublicRevision(revision: PipelineRevision): PipelineRevision {
    const sanitized = Object.assign(new PipelineRevision(), revision);
    sanitized.definition = sanitizePipelineDefinitionForOutput(revision.definition);
    return sanitized;
}

@Injectable()
export class PipelineLifecycleService {
    constructor(
        private connection: TransactionalConnection,
        private definitionValidator: DefinitionValidationService,
        private domainEvents: DomainEventsService,
        private revisionService: RevisionService,
        private queries: PipelineQueryService,
    ) {}

    async publish(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const pipeline = await this.queries.getInActiveChannel(ctx, id);
        assertPipelineStatus(pipeline.status, [PipelineStatus.REVIEW], 'publish');
        const revision = await this.revisionService.publishVersion(ctx, {
            pipelineId: id,
            authorUserId: ctx.activeUserId?.toString(),
        });
        return assertFound(this.queries.findOne(ctx, revision.pipelineId));
    }

    async approve(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const pipeline = await this.queries.getInActiveChannel(ctx, id);
        assertPipelineStatus(pipeline.status, [PipelineStatus.REVIEW], 'approve');
        const canReview = ctx.userHasPermissions([
            ReviewDataHubPipelinePermission.Permission,
        ]);
        const canPublish = ctx.userHasPermissions([
            PublishDataHubPipelinePermission.Permission,
        ]);
        if (!canReview || !canPublish) {
            throw new Error('Approving a pipeline requires both review and publish permissions');
        }
        return this.publish(ctx, id);
    }

    async submitForReview(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.queries.getInActiveChannel(ctx, id);
        assertPipelineStatus(pipeline.status, [PipelineStatus.DRAFT], 'submit for review');
        this.definitionValidator.validate(pipeline.definition);
        const update = await repo.update(
            createPipelineWriteGuard(pipeline),
            { status: PipelineStatus.REVIEW },
        );
        if (update.affected !== 1) {
            throw new Error(
                'Pipeline changed concurrently; reload before submitting for review',
            );
        }
        pipeline.status = PipelineStatus.REVIEW;
        advancePipelineRowVersion(pipeline);
        return assertFound(this.queries.findOne(ctx, pipeline.id));
    }

    async rejectReview(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.queries.getInActiveChannel(ctx, id);
        assertPipelineStatus(pipeline.status, [PipelineStatus.REVIEW], 'reject review for');
        const update = await repo.update(
            createPipelineWriteGuard(pipeline),
            { status: PipelineStatus.DRAFT },
        );
        if (update.affected !== 1) {
            throw new Error(
                'Pipeline changed concurrently; reload before rejecting review',
            );
        }
        pipeline.status = PipelineStatus.DRAFT;
        advancePipelineRowVersion(pipeline);
        return assertFound(this.queries.findOne(ctx, pipeline.id));
    }

    async archive(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.queries.getInActiveChannel(ctx, id);
        assertDatabaseConfiguration(
            pipeline.configurationSource,
            'Pipeline',
            pipeline.code,
            'archived',
        );
        assertPipelineStatus(pipeline.status, [PipelineStatus.PUBLISHED], 'archive');
        const update = await repo.update(
            createPipelineWriteGuard(pipeline),
            { status: PipelineStatus.ARCHIVED, enabled: false },
        );
        if (update.affected !== 1) {
            throw new Error('Pipeline changed concurrently; reload before archiving');
        }
        pipeline.status = PipelineStatus.ARCHIVED;
        pipeline.enabled = false;
        advancePipelineRowVersion(pipeline);
        this.domainEvents.publishPipelineArchived(pipeline.id.toString(), pipeline.code);
        return assertFound(this.queries.findOne(ctx, pipeline.id));
    }

    async reactivate(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.queries.getInActiveChannel(ctx, id);
        assertDatabaseConfiguration(
            pipeline.configurationSource,
            'Pipeline',
            pipeline.code,
            'reactivated',
        );
        assertPipelineStatus(pipeline.status, [PipelineStatus.ARCHIVED], 'reactivate');
        const definition = await loadPublishedPipelineDefinition(
            this.connection,
            ctx,
            pipeline,
        );
        const update = await repo.update(
            createPipelineWriteGuard(pipeline),
            {
                definition: definition as never,
                status: PipelineStatus.PUBLISHED,
                enabled: true,
            },
        );
        if (update.affected !== 1) {
            throw new Error('Pipeline changed concurrently; reload before reactivating');
        }
        pipeline.definition = definition;
        pipeline.status = PipelineStatus.PUBLISHED;
        pipeline.enabled = true;
        advancePipelineRowVersion(pipeline);
        this.domainEvents.publishPipelineReactivated(pipeline.id.toString(), pipeline.code);
        return assertFound(this.queries.findOne(ctx, pipeline.id));
    }

    async listRevisions(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<PipelineRevision[]> {
        await this.queries.getInActiveChannel(ctx, pipelineId);
        const revisions = await this.connection.getRepository(ctx, PipelineRevision).find({
            where: { pipelineId },
            order: { createdAt: SortOrder.DESC },
        });
        return revisions.map(toPublicRevision);
    }

    async revertToRevision(
        ctx: RequestContext,
        revisionId: ID,
    ): Promise<Pipeline> {
        const revision = await this.connection.getEntityOrThrow(
            ctx,
            PipelineRevision,
            revisionId,
        );
        const pipeline = await this.connection.getEntityOrThrow(
            ctx,
            Pipeline,
            revision.pipelineId,
            { channelId: ctx.channelId },
        );
        assertDatabaseConfiguration(
            pipeline.configurationSource,
            'Pipeline',
            pipeline.code,
            'reverted',
        );
        const revertedRevision = await this.revisionService.revertToRevision(ctx, {
            revisionId,
            authorUserId: ctx.activeUserId?.toString(),
        });
        return assertFound(this.queries.findOne(ctx, revertedRevision.pipelineId));
    }
}
