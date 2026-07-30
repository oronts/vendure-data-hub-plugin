import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import {
    AutoSaveConfig,
    PipelineDefinition,
    PublishVersionOptions,
    RevertOptions,
    RevisionDiff,
    SaveDraftOptions,
    TimelineEntry,
} from '../../types';
import { PAGINATION, LOGGER_CONTEXTS } from '../../constants';
import { Pipeline, PipelineRevision } from '../../entities/pipeline';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { DomainEventsService } from '../events/domain-events.service';
import { DataHubLoggerFactory } from '../logger';
import { PipelineExecutionPermissionService } from '../pipeline/pipeline-execution-permission.service';
import { DefinitionValidationService } from '../validation/definition-validation.service';
import { DiffService } from './diff.service';
import { RevisionChannelAccessService } from './revision-channel-access.service';
import { RevisionDraftService } from './revision-draft.service';
import { RevisionPublicationService } from './revision-publication.service';
import { RevisionQueryService } from './revision-query.service';

@Injectable()
export class RevisionService {
    private readonly drafts: RevisionDraftService;
    private readonly publications: RevisionPublicationService;
    private readonly queries: RevisionQueryService;

    constructor(
        connection: TransactionalConnection,
        diffService: DiffService,
        definitionValidator: DefinitionValidationService,
        registry: DataHubRegistryService,
        executionPermissions: PipelineExecutionPermissionService,
        domainEvents: DomainEventsService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        const logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_SERVICE);
        const access = new RevisionChannelAccessService(connection);
        this.drafts = new RevisionDraftService(
            connection,
            diffService,
            definitionValidator,
            access,
            logger,
        );
        this.publications = new RevisionPublicationService(
            connection,
            diffService,
            definitionValidator,
            registry,
            executionPermissions,
            domainEvents,
            access,
            this.drafts,
            logger,
        );
        this.queries = new RevisionQueryService(
            connection,
            diffService,
            access,
        );
    }

    setAutoSaveConfig(config: Partial<AutoSaveConfig>): void {
        this.drafts.setAutoSaveConfig(config);
    }

    saveDraft(
        ctx: RequestContext,
        options: SaveDraftOptions,
    ): Promise<PipelineRevision | null> {
        return this.drafts.saveDraft(ctx, options);
    }

    publishVersion(
        ctx: RequestContext,
        options: PublishVersionOptions,
    ): Promise<PipelineRevision> {
        return this.publications.publishVersion(ctx, options);
    }

    refreshCodeFirstPublishedDefinition(
        ctx: RequestContext,
        pipelineId: ID,
        definition: PipelineDefinition,
    ): Promise<PipelineRevision> {
        return this.publications.refreshCodeFirstPublishedDefinition(
            ctx,
            pipelineId,
            definition,
        );
    }

    revertToRevision(
        ctx: RequestContext,
        options: RevertOptions,
    ): Promise<PipelineRevision> {
        return this.publications.revertToRevision(ctx, options);
    }

    getTimeline(
        ctx: RequestContext,
        pipelineId: ID,
        limit: number = PAGINATION.EVENTS_LIMIT,
    ): Promise<TimelineEntry[]> {
        return this.queries.getTimeline(ctx, pipelineId, limit);
    }

    getDiff(
        ctx: RequestContext,
        fromRevisionId: ID,
        toRevisionId: ID,
    ): Promise<RevisionDiff> {
        return this.queries.getDiff(ctx, fromRevisionId, toRevisionId);
    }

    getLatestDraft(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<PipelineRevision | null> {
        return this.queries.getLatestDraft(ctx, pipelineId);
    }

    getLatestPublished(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<PipelineRevision | null> {
        return this.queries.getLatestPublished(ctx, pipelineId);
    }

    getRevision(
        ctx: RequestContext,
        revisionId: ID,
    ): Promise<PipelineRevision | null> {
        return this.queries.getRevision(ctx, revisionId);
    }

    pruneDrafts(
        ctx: RequestContext,
        pipelineId: ID,
        clearAll = false,
    ): Promise<number> {
        return this.drafts.pruneDrafts(ctx, pipelineId, clearAll);
    }

    hasUnpublishedChanges(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<boolean> {
        return this.queries.hasUnpublishedChanges(ctx, pipelineId);
    }

    getPublishedVersionCount(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<number> {
        return this.queries.getPublishedVersionCount(ctx, pipelineId);
    }

    restoreDraft(
        ctx: RequestContext,
        revisionId: ID,
    ): Promise<Pipeline> {
        return this.drafts.restoreDraft(ctx, revisionId);
    }
}
