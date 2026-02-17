/**
 * Collection upsert loader handler
 */
import { Injectable, Logger } from '@nestjs/common';
import {
    RequestContext,
    CollectionService,
    RequestContextService,
    ID,
} from '@vendure/core';
import {
    LanguageCode,
    CreateCollectionInput,
    UpdateCollectionInput,
} from '@vendure/common/lib/generated-types';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { getErrorMessage } from '../../../utils/error.utils';
import { getStringValue } from '../../../loaders/shared-helpers';

/**
 * Configuration for collection handler step
 */
interface CollectionHandlerConfig {
    /** Field name for collection name */
    nameField?: string;
    /** Field name for collection slug */
    slugField?: string;
    /** Field name for collection description */
    descriptionField?: string;
    /** Field name for parent collection slug */
    parentSlugField?: string;
    /** Target channel token */
    channel?: string;
    /** Whether to trigger filter application after upsert */
    applyFilters?: boolean;
}

/**
 * Coerced collection field values from a record
 */
interface CoercedCollectionFields {
    slug: string | undefined;
    name: string | undefined;
    description: string | undefined;
    parentSlug: string | undefined;
}

/**
 * Safely cast step config to CollectionHandlerConfig
 */
function getConfig(config: Record<string, unknown>): CollectionHandlerConfig {
    return config as unknown as CollectionHandlerConfig;
}

/**
 * Extract collection fields from a record using config-specified field names
 */
function coerceCollectionFields(rec: RecordObject, cfg: CollectionHandlerConfig): CoercedCollectionFields {
    const nameKey = cfg.nameField ?? 'name';
    const slugKey = cfg.slugField ?? 'slug';
    const descKey = cfg.descriptionField ?? 'description';
    const parentSlugKey = cfg.parentSlugField ?? 'parentSlug';

    return {
        slug: getStringValue(rec, slugKey),
        name: getStringValue(rec, nameKey),
        description: getStringValue(rec, descKey),
        parentSlug: getStringValue(rec, parentSlugKey),
    };
}

@Injectable()
export class CollectionHandler implements LoaderHandler {
    private readonly logger = new Logger(CollectionHandler.name);

    constructor(
        private collectionService: CollectionService,
        private requestContextService: RequestContextService,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0;
        let fail = 0;
        const cfg = getConfig(step.config);

        for (const rec of input) {
            try {
                const fields = coerceCollectionFields(rec, cfg);
                const { slug, name, description, parentSlug } = fields;

                if (!slug || !name) {
                    fail++;
                    continue;
                }

                const opCtx = await this.resolveRequestContext(ctx, cfg);
                const collectionId = await this.upsertCollection(opCtx, slug, name, description, parentSlug);

                if (collectionId) {
                    await this.maybeApplyFilters(opCtx, cfg, collectionId);
                    ok++;
                } else {
                    fail++;
                }
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'collectionUpsert failed', rec);
                }
                fail++;
            }
        }
        return { ok, fail };
    }

    /**
     * Resolve the appropriate request context (handles channel switching)
     */
    private async resolveRequestContext(
        ctx: RequestContext,
        cfg: CollectionHandlerConfig,
    ): Promise<RequestContext> {
        const channel = cfg.channel;
        if (!channel) {
            return ctx;
        }

        try {
            return await this.requestContextService.create({
                apiType: 'admin',
                channelOrToken: channel,
            });
        } catch (err) {
            // Channel resolution failed - fall back to original context
            // This is expected when the channel token is invalid
            Logger.debug(`Failed to resolve channel context: ${getErrorMessage(err)}`, 'CollectionHandler');
            return ctx;
        }
    }

    /**
     * Create or update a collection based on slug lookup
     */
    private async upsertCollection(
        opCtx: RequestContext,
        slug: string,
        name: string,
        description: string | undefined,
        parentSlug: string | undefined,
    ): Promise<ID | undefined> {
        const existing = await this.collectionService.findOneBySlug(opCtx, slug);

        if (existing) {
            const updateInput: UpdateCollectionInput = {
                id: existing.id,
                translations: [{
                    languageCode: opCtx.languageCode as LanguageCode,
                    name,
                    slug,
                    description,
                }],
            };
            const updated = await this.collectionService.update(opCtx, updateInput);
            return updated.id;
        }

        // Creating new collection
        let parentId: ID | undefined;
        if (parentSlug) {
            const parent = await this.collectionService.findOneBySlug(opCtx, parentSlug);
            if (parent) {
                parentId = parent.id;
            }
        }

        const createInput: CreateCollectionInput = {
            parentId,
            filters: [], // Required field - empty array for manual collections
            translations: [{
                languageCode: opCtx.languageCode as LanguageCode,
                name,
                slug,
                description: description ?? '',
            }],
        };
        const created = await this.collectionService.create(opCtx, createInput);
        return created.id;
    }

    /**
     * Optionally trigger filter application if configured
     */
    private async maybeApplyFilters(
        opCtx: RequestContext,
        cfg: CollectionHandlerConfig,
        collectionId: ID,
    ): Promise<void> {
        const applyFilters = cfg.applyFilters ?? false;
        if (!applyFilters) {
            return;
        }

        try {
            await this.collectionService.triggerApplyFiltersJob(opCtx, { collectionIds: [collectionId] });
        } catch (error) {
            this.logger.warn(
                `Failed to apply collection filters for collection ${String(collectionId)}: ${getErrorMessage(error)}`,
            );
        }
    }

    async simulate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<Record<string, unknown>> {
        let exists = 0;
        let missing = 0;
        const cfg = getConfig(step.config);

        for (const rec of input) {
            const fields = coerceCollectionFields(rec, cfg);
            const { slug } = fields;
            if (!slug) continue;

            const collection = await this.collectionService.findOneBySlug(ctx, slug);
            if (collection) {
                exists++;
            } else {
                missing++;
            }
        }
        return { exists, missing };
    }
}
