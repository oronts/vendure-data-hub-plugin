/**
 * Collection upsert loader handler
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    CollectionService,
    RequestContextService,
    ChannelService,
    Collection,
    ID,
} from '@vendure/core';
import { createChannelCodeRequestContext } from '../../helpers/channel-request-context';
import {
    LanguageCode,
    CreateCollectionTranslationInput,
    CreateCollectionInput,
    UpdateCollectionInput,
} from '@vendure/common/lib/generated-types';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, LoaderExecutionResult } from '../../executor-types';
import { LoaderHandler, LoaderSimulationResult } from './types';
import { assertCreateDuplicateCanBeSkipped, CreateDuplicateHandlingConfig } from './duplicate-handling';
import { LoadStrategy } from '../../../constants/enums';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import {
    getBooleanValue,
    getObjectValue,
    getStringValue,
    slugify,
} from '../../../loaders/shared-helpers';
import {
    getTranslationString,
    parseTranslationsInput,
    resolveChannelIds,
} from './shared-lookups';
import { LOGGER_CONTEXTS } from '../../../constants/core';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import {
    createUpsertSimulationDetail,
    summarizeSimulationDetails,
} from './loader-simulation';

/**
 * Configuration for collection handler step
 */
interface CollectionHandlerConfig extends CreateDuplicateHandlingConfig {
    /** Field name for collection name */
    nameField?: string;
    /** Field name for collection slug */
    slugField?: string;
    /** Field name for collection description */
    descriptionField?: string;
    /** Field name for parent collection slug */
    parentSlugField?: string;
    /** Field name for custom fields object */
    customFieldsField?: string;
    /** Target channel token */
    channel?: string;
    /** Whether to trigger filter application after upsert */
    applyFilters?: boolean;
    /** Load strategy: UPSERT (default), CREATE, or UPDATE */
    strategy?: LoadStrategy;
    /** Record field containing multi-language translations (array or object map) */
    translationsField?: string;
    /** Record field containing channel codes for dynamic per-record channel assignment */
    channelsField?: string;
    /** Record field containing isPrivate flag */
    isPrivateField?: string;
}

interface CollectionUpsertResult {
    collectionId: ID | undefined;
    skipped: boolean;
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

function applyCollectionTranslationIdentityFallback(
    record: RecordObject,
    config: CollectionHandlerConfig,
    fields: CoercedCollectionFields,
): void {
    if ((fields.name && fields.slug) || !config.translationsField) return;
    const raw = record[config.translationsField];
    if (!raw) return;
    const first = parseTranslationsInput(raw)[0];
    if (!first) return;
    const firstName = getTranslationString(first, 'name');
    if (!fields.name && firstName) fields.name = firstName;
    if (!fields.slug && firstName) {
        fields.slug = getTranslationString(first, 'slug') ?? slugify(firstName);
    }
}

@Injectable()
export class CollectionHandler implements LoaderHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private collectionService: CollectionService,
        private requestContextService: RequestContextService,
        private channelService: ChannelService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.COLLECTION_LOADER);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<LoaderExecutionResult> {
        let ok = 0;
        let fail = 0;
        let skipped = 0;
        const cfg = getConfig(step.config);

        const channelCache = new Map<string, ID>();

        for (const rec of input) {
            try {
                const fields = coerceCollectionFields(rec, cfg);
                applyCollectionTranslationIdentityFallback(rec, cfg, fields);
                const { slug, name } = fields;
                const { description } = fields;
                const { parentSlug } = fields;

                if (!slug || !name) {
                    if (onRecordError) {
                        await onRecordError(step.key, 'Missing required field: name or slug', rec);
                    }
                    fail++;
                    continue;
                }

                const customFieldsKey = cfg.customFieldsField ?? 'customFields';
                const customFields = getObjectValue(rec, customFieldsKey);

                // Resolve isPrivate from record
                const isPrivate = cfg.isPrivateField
                    ? getBooleanValue(rec, cfg.isPrivateField)
                    : undefined;

                // Build translations
                const translations = this.buildTranslations(ctx, rec, cfg, name, slug, description);

                const opCtx = await this.resolveRequestContext(ctx, cfg);
                const collectionResult = await this.upsertCollection(
                    opCtx,
                    slug,
                    name,
                    description,
                    parentSlug,
                    customFields,
                    cfg,
                    translations,
                    isPrivate,
                );
                if (collectionResult.skipped) {
                    skipped++;
                    continue;
                }
                const { collectionId } = collectionResult;

                if (collectionId) {
                    await this.maybeApplyFilters(opCtx, cfg, collectionId);
                    await this.assignToRecordChannels(opCtx, rec, cfg, collectionId, channelCache);
                    ok++;
                } else {
                    if (onRecordError) {
                        await onRecordError(step.key, `Collection not found for update: ${slug}`, rec);
                    }
                    fail++;
                }
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'collectionUpsert failed', rec, getErrorStack(e));
                }
                fail++;
            }
        }
        return { ok, fail, skipped };
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

        return createChannelCodeRequestContext(
            this.requestContextService,
            this.channelService,
            ctx,
            channel,
        );
    }

    /**
     * Build collection translations from record.
     * If translationsField is set, reads multi-language array/object from the record.
     * Otherwise builds a single translation from name/slug/description.
     */
    private buildTranslations(
        ctx: RequestContext,
        rec: RecordObject,
        cfg: CollectionHandlerConfig,
        name: string,
        slug: string,
        description: string | undefined,
    ): CreateCollectionTranslationInput[] {
        if (cfg.translationsField) {
            const raw = rec[cfg.translationsField];
            if (raw) {
                const parsed = parseTranslationsInput(raw);
                if (parsed.length > 0) {
                    return parsed.map(translation => {
                        const translatedName = getTranslationString(translation, 'name', name);
                        return {
                            languageCode: translation.languageCode as LanguageCode,
                            name: translatedName,
                            slug: getTranslationString(translation, 'slug')
                                ?? slugify(translatedName),
                            description: getTranslationString(translation, 'description', ''),
                        };
                    });
                }
            }
        }

        return [{
            languageCode: ctx.languageCode as LanguageCode,
            name,
            slug,
            description: description ?? '',
        }];
    }

    /**
     * Assign collection to dynamically resolved channels from a record field
     */
    private async assignToRecordChannels(
        opCtx: RequestContext,
        rec: RecordObject,
        cfg: CollectionHandlerConfig,
        collectionId: ID,
        channelCache: Map<string, ID>,
    ): Promise<void> {
        if (!cfg.channelsField) return;
        const rawValue = rec[cfg.channelsField];
        if (rawValue == null) return;

        const channelIds = await resolveChannelIds(this.channelService, opCtx, rawValue, channelCache, this.logger);
        if (channelIds.length === 0) return;

        try {
            await this.channelService.assignToChannels(opCtx, Collection, collectionId, channelIds);
        } catch (error) {
            this.logger.warn('Failed to assign collection to record channels', {
                collectionId,
                channelIds,
                error: getErrorMessage(error),
            });
            throw error;
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
        customFields: Record<string, unknown> | undefined,
        cfg: CollectionHandlerConfig,
        translations: CreateCollectionTranslationInput[],
        isPrivate: boolean | undefined,
    ): Promise<CollectionUpsertResult> {
        const strategy = cfg.strategy ?? LoadStrategy.UPSERT;
        const existing = await this.collectionService.findOneBySlug(opCtx, slug);

        if (existing) {
            if (strategy === LoadStrategy.CREATE) {
                assertCreateDuplicateCanBeSkipped(cfg, 'collection', slug);
                return { collectionId: existing.id, skipped: true };
            }
            const updateInput: UpdateCollectionInput = {
                id: existing.id,
                translations,
                ...(typeof isPrivate === 'boolean' ? { isPrivate } : {}),
            };
            if (customFields) {
                updateInput.customFields = customFields;
            }
            const updated = await this.collectionService.update(opCtx, updateInput);
            return { collectionId: updated.id, skipped: false };
        }

        if (strategy === LoadStrategy.UPDATE) {
            return { collectionId: undefined, skipped: false };
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
            translations,
            ...(typeof isPrivate === 'boolean' ? { isPrivate } : {}),
        };
        if (customFields) {
            createInput.customFields = customFields;
        }
        const created = await this.collectionService.create(opCtx, createInput);
        return { collectionId: created.id, skipped: false };
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
    ): Promise<LoaderSimulationResult> {
        const cfg = getConfig(step.config);
        const recordDetails = [];

        for (let index = 0; index < input.length; index++) {
            const record = input[index];
            const fields = coerceCollectionFields(record, cfg);
            applyCollectionTranslationIdentityFallback(record, cfg, fields);
            const opCtx = await this.resolveRequestContext(ctx, cfg);
            const existing = fields.slug
                ? await this.collectionService.findOneBySlug(opCtx, fields.slug)
                : undefined;
            const missingField = !fields.name ? 'name' : !fields.slug ? 'slug' : undefined;
            recordDetails.push(createUpsertSimulationDetail({
                record,
                index,
                entityType: 'Collection',
                existing,
                strategy: cfg.strategy,
                skipDuplicates: cfg.skipDuplicates,
                identifier: fields.slug,
                missingIdentifier: missingField
                    ? `Missing required field "${missingField}" for collectionUpsert`
                    : undefined,
            }));
        }

        return {
            supported: true,
            recordsIn: input.length,
            recordDetails,
            ...summarizeSimulationDetails(recordDetails),
        };
    }
}
