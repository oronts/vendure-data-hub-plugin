import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    FacetService,
    FacetValueService,
    RequestContextService,
    ChannelService,
    Facet,
    FacetValue,
    LanguageCode,
    TransactionalConnection,
    ID,
} from '@vendure/core';
import { createChannelCodeRequestContext } from '../../helpers/channel-request-context';
import { FacetTranslationInput } from '@vendure/common/lib/generated-types';
import { JsonObject, PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, LoaderExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { LoadStrategy } from '../../../constants/enums';
import { assertCreateDuplicateCanBeSkipped, CreateDuplicateHandlingConfig } from './duplicate-handling';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import {
    getBooleanValue,
    getObjectValue,
    getStringValue,
} from '../../../loaders/shared-helpers';
import {
    getTranslationString,
    parseTranslationsInput,
    resolveChannelIds,
} from './shared-lookups';
import { LOGGER_CONTEXTS } from '../../../constants/core';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger/datahub-logger';

interface FacetUpsertConfig extends CreateDuplicateHandlingConfig {
    channel?: string;
    codeField?: string;
    nameField?: string;
    privateField?: string;
    customFieldsField?: string;
    strategy?: LoadStrategy;
    /** Record field containing multi-language translations (array or object map) */
    translationsField?: string;
    /** Record field containing channel codes for dynamic per-record channel assignment */
    channelsField?: string;
}

interface FacetValueUpsertConfig extends CreateDuplicateHandlingConfig {
    channel?: string;
    facetCodeField?: string;
    codeField?: string;
    nameField?: string;
    customFieldsField?: string;
    strategy?: LoadStrategy;
    /** Record field containing multi-language translations (array or object map) */
    translationsField?: string;
    /** Record field containing channel codes for dynamic per-record channel assignment */
    channelsField?: string;
}

@Injectable()
export class FacetHandler implements LoaderHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private facetService: FacetService,
        private requestContextService: RequestContextService,
        private connection: TransactionalConnection,
        private channelService: ChannelService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FACET_LOADER);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<LoaderExecutionResult> {
        let ok = 0, fail = 0, skipped = 0;
        const cfg = (step.config ?? {}) as FacetUpsertConfig;
        const channelCache = new Map<string, ID>();

        for (const rec of input) {
            try {
                const codeField = cfg.codeField ?? 'code';
                const nameField = cfg.nameField ?? 'name';
                const code = getStringValue(rec, codeField);
                let name = getStringValue(rec, nameField) ?? code ?? '';

                // Multi-language: extract name from first translation if missing
                if ((!name || name === code) && cfg.translationsField) {
                    const raw = rec[cfg.translationsField];
                    if (raw) {
                        const parsed = parseTranslationsInput(raw);
                        if (parsed[0]) {
                            name = getTranslationString(parsed[0], 'name') ?? name;
                        }
                    }
                }

                if (!code) {
                    if (onRecordError) {
                        await onRecordError(step.key, 'Missing required field: code', rec);
                    }
                    fail++;
                    continue;
                }

                const customFieldsKey = cfg.customFieldsField ?? 'customFields';
                const customFields = getObjectValue(rec, customFieldsKey);
                const isPrivate = cfg.privateField
                    ? getBooleanValue(rec, cfg.privateField)
                    : undefined;

                let opCtx = ctx;
                if (cfg.channel) {
                    opCtx = await createChannelCodeRequestContext(
                        this.requestContextService,
                        this.channelService,
                        ctx,
                        cfg.channel,
                    );
                }

                // Build translations
                const translations = this.buildTranslations(opCtx, rec, cfg, name);

                const existing = await this.facetService.findByCode(opCtx, code, opCtx.languageCode || LanguageCode.en);
                const strategy = cfg.strategy ?? LoadStrategy.UPSERT;
                let facetId: ID | undefined;

                if (existing) {
                    if (strategy === LoadStrategy.CREATE) {
                        assertCreateDuplicateCanBeSkipped(cfg, 'facet', code);
                        skipped++;
                        continue;
                    }
                    const updated = await this.facetService.update(opCtx, {
                        id: existing.id,
                        isPrivate: isPrivate ?? existing.isPrivate,
                        translations,
                        ...(customFields ? { customFields } : {}),
                    });
                    facetId = updated.id;
                } else {
                    if (strategy === LoadStrategy.UPDATE) {
                        fail++;
                        if (onRecordError) await onRecordError(step.key, `Facet not found for update: ${code}`, rec as JsonObject);
                        continue;
                    }
                    const created = await this.facetService.create(opCtx, {
                        code,
                        isPrivate: isPrivate ?? false,
                        translations,
                        ...(customFields ? { customFields } : {}),
                    });
                    facetId = created.id;
                }

                // Assign to record channels
                if (facetId && cfg.channelsField) {
                    const rawValue = rec[cfg.channelsField];
                    if (rawValue != null) {
                        const channelIds = await resolveChannelIds(this.channelService, opCtx, rawValue, channelCache, this.logger);
                        if (channelIds.length > 0) {
                            try {
                                await this.channelService.assignToChannels(opCtx, Facet, facetId, channelIds);
                            } catch (error) {
                                this.logger.warn('Failed to assign facet to record channels', {
                                    facetId,
                                    channelIds,
                                    error: getErrorMessage(error),
                                });
                                throw error;
                            }
                        }
                    }
                }

                ok++;
            } catch (e: unknown) {
                if (onRecordError) await onRecordError(step.key, getErrorMessage(e) || 'facetUpsert failed', rec as JsonObject, getErrorStack(e));
                fail++;
            }
        }
        return { ok, fail, skipped };
    }

    /**
     * Build facet translations. Multi-language from translationsField, or single-language fallback.
     * Facet translations only have {languageCode, name}.
     */
    private buildTranslations(
        ctx: RequestContext,
        rec: RecordObject,
        cfg: FacetUpsertConfig,
        name: string,
    ): FacetTranslationInput[] {
        if (cfg.translationsField) {
            const raw = rec[cfg.translationsField];
            if (raw) {
                const parsed = parseTranslationsInput(raw);
                if (parsed.length > 0) {
                    return parsed.map(t => ({
                        languageCode: t.languageCode as LanguageCode,
                        name: getTranslationString(t, 'name', name),
                    }));
                }
            }
        }
        return [{
            languageCode: ctx.languageCode || LanguageCode.en,
            name,
        }];
    }
}

@Injectable()
export class FacetValueHandler implements LoaderHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private facetService: FacetService,
        private facetValueService: FacetValueService,
        private requestContextService: RequestContextService,
        private channelService: ChannelService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FACET_VALUE_LOADER);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<LoaderExecutionResult> {
        let ok = 0, fail = 0, skipped = 0;
        const cfg = (step.config ?? {}) as FacetValueUpsertConfig;
        const channelCache = new Map<string, ID>();

        for (const rec of input) {
            try {
                const facetCodeField = cfg.facetCodeField ?? 'facetCode';
                const codeField = cfg.codeField ?? 'code';
                const nameField = cfg.nameField ?? 'name';
                const facetCode = getStringValue(rec, facetCodeField);
                const code = getStringValue(rec, codeField);
                let name = getStringValue(rec, nameField) ?? code ?? '';

                // Multi-language: extract name from first translation if missing
                if ((!name || name === code) && cfg.translationsField) {
                    const raw = rec[cfg.translationsField];
                    if (raw) {
                        const parsed = parseTranslationsInput(raw);
                        if (parsed[0]) {
                            name = getTranslationString(parsed[0], 'name') ?? name;
                        }
                    }
                }

                if (!facetCode || !code) {
                    if (onRecordError) {
                        await onRecordError(
                            step.key,
                            'Missing required field: facetCode or code',
                            rec,
                        );
                    }
                    fail++;
                    continue;
                }

                const customFieldsKey = cfg.customFieldsField ?? 'customFields';
                const customFields = getObjectValue(rec, customFieldsKey);

                let opCtx = ctx;
                if (cfg.channel) {
                    opCtx = await createChannelCodeRequestContext(
                        this.requestContextService,
                        this.channelService,
                        ctx,
                        cfg.channel,
                    );
                }

                // Build translations
                const translations = this.buildTranslations(opCtx, rec, cfg, name);

                const facet = await this.facetService.findByCode(opCtx, facetCode, opCtx.languageCode || LanguageCode.en);
                if (!facet) {
                    if (onRecordError) await onRecordError(step.key, `Facet not found: ${facetCode}`, rec as JsonObject);
                    fail++;
                    continue;
                }

                const existingValues = await this.facetValueService.findByFacetId(opCtx, facet.id);
                const existing = existingValues.find(v => v.code === code);
                const strategy = cfg.strategy ?? LoadStrategy.UPSERT;
                let facetValueId: ID | undefined;

                if (existing) {
                    if (strategy === LoadStrategy.CREATE) {
                        assertCreateDuplicateCanBeSkipped(cfg, 'facet value', `${facetCode}/${code}`);
                        skipped++;
                        continue;
                    }
                    const updated = await this.facetValueService.update(opCtx, {
                        id: existing.id,
                        translations,
                        ...(customFields ? { customFields } : {}),
                    });
                    facetValueId = updated.id;
                } else {
                    if (strategy === LoadStrategy.UPDATE) {
                        fail++;
                        if (onRecordError) await onRecordError(step.key, `Facet value not found for update: ${code}`, rec as JsonObject);
                        continue;
                    }
                    const created = await this.facetValueService.create(opCtx, facet, {
                        code,
                        translations,
                        ...(customFields ? { customFields } : {}),
                    });
                    facetValueId = created.id;
                }

                // Assign to record channels
                if (facetValueId && cfg.channelsField) {
                    const rawValue = rec[cfg.channelsField];
                    if (rawValue != null) {
                        const channelIds = await resolveChannelIds(this.channelService, opCtx, rawValue, channelCache, this.logger);
                        if (channelIds.length > 0) {
                            try {
                                await this.channelService.assignToChannels(opCtx, FacetValue, facetValueId, channelIds);
                            } catch (error) {
                                this.logger.warn('Failed to assign facet value to record channels', {
                                    facetValueId,
                                    channelIds,
                                    error: getErrorMessage(error),
                                });
                                throw error;
                            }
                        }
                    }
                }

                ok++;
            } catch (e: unknown) {
                if (onRecordError) await onRecordError(step.key, getErrorMessage(e) || 'facetValueUpsert failed', rec as JsonObject, getErrorStack(e));
                fail++;
            }
        }
        return { ok, fail, skipped };
    }

    /**
     * Build facet value translations. Multi-language from translationsField, or single-language fallback.
     * FacetValue translations only have {languageCode, name}.
     */
    private buildTranslations(
        ctx: RequestContext,
        rec: RecordObject,
        cfg: FacetValueUpsertConfig,
        name: string,
    ): FacetTranslationInput[] {
        if (cfg.translationsField) {
            const raw = rec[cfg.translationsField];
            if (raw) {
                const parsed = parseTranslationsInput(raw);
                if (parsed.length > 0) {
                    return parsed.map(t => ({
                        languageCode: t.languageCode as LanguageCode,
                        name: getTranslationString(t, 'name', name),
                    }));
                }
            }
        }
        return [{
            languageCode: ctx.languageCode || LanguageCode.en,
            name,
        }];
    }
}
