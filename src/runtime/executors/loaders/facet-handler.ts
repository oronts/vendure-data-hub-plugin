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
import { FacetTranslationInput } from '@vendure/common/lib/generated-types';
import { JsonObject, PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { LoadStrategy } from '../../../constants/enums';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { getObjectValue } from '../../../loaders/shared-helpers';
import { parseTranslationsInput, resolveChannelIds } from './shared-lookups';
import { LOGGER_CONTEXTS } from '../../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';

interface FacetUpsertConfig {
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

interface FacetValueUpsertConfig {
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

interface FacetRecord {
    [key: string]: unknown;
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
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;
        const cfg = (step.config ?? {}) as FacetUpsertConfig;
        const channelCache = new Map<string, ID>();

        for (const rec of input) {
            try {
                const record = rec as FacetRecord;
                const codeField = cfg.codeField ?? 'code';
                const nameField = cfg.nameField ?? 'name';
                const code = String(record[codeField] ?? '');
                let name = String(record[nameField] ?? code);

                // Multi-language: extract name from first translation if missing
                if ((!name || name === code) && cfg.translationsField) {
                    const raw = rec[cfg.translationsField];
                    if (raw) {
                        const parsed = parseTranslationsInput(raw);
                        if (parsed.length > 0 && parsed[0].name) {
                            name = String(parsed[0].name);
                        }
                    }
                }

                if (!code) { fail++; continue; }

                const customFieldsKey = cfg.customFieldsField ?? 'customFields';
                const customFields = getObjectValue(rec, customFieldsKey);

                let opCtx = ctx;
                if (cfg.channel) {
                    const req = await this.requestContextService.create({ apiType: ctx.apiType, channelOrToken: cfg.channel });
                    if (req) opCtx = req;
                }

                // Build translations
                const translations = this.buildTranslations(opCtx, rec, cfg, name);

                const existing = await this.facetService.findByCode(opCtx, code, opCtx.languageCode || LanguageCode.en);
                const strategy = cfg.strategy ?? LoadStrategy.UPSERT;
                let facetId: ID | undefined;

                if (existing) {
                    if (strategy === LoadStrategy.CREATE) {
                        ok++;
                        continue;
                    }
                    const updated = await this.facetService.update(opCtx, {
                        id: existing.id,
                        isPrivate: cfg.privateField ? Boolean(record[cfg.privateField]) : existing.isPrivate,
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
                        isPrivate: cfg.privateField ? Boolean(record[cfg.privateField]) : false,
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
                            } catch { /* channel assignment is best-effort */ }
                        }
                    }
                }

                ok++;
            } catch (e: unknown) {
                if (onRecordError) await onRecordError(step.key, getErrorMessage(e) || 'facetUpsert failed', rec as JsonObject, getErrorStack(e));
                fail++;
            }
        }
        return { ok, fail };
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
                        languageCode: String(t.languageCode) as LanguageCode,
                        name: String(t.name ?? name),
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
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;
        const cfg = (step.config ?? {}) as FacetValueUpsertConfig;
        const channelCache = new Map<string, ID>();

        for (const rec of input) {
            try {
                const record = rec as FacetRecord;
                const facetCodeField = cfg.facetCodeField ?? 'facetCode';
                const codeField = cfg.codeField ?? 'code';
                const nameField = cfg.nameField ?? 'name';
                const facetCode = String(record[facetCodeField] ?? '');
                const code = String(record[codeField] ?? '');
                let name = String(record[nameField] ?? code);

                // Multi-language: extract name from first translation if missing
                if ((!name || name === code) && cfg.translationsField) {
                    const raw = rec[cfg.translationsField];
                    if (raw) {
                        const parsed = parseTranslationsInput(raw);
                        if (parsed.length > 0 && parsed[0].name) {
                            name = String(parsed[0].name);
                        }
                    }
                }

                if (!facetCode || !code) { fail++; continue; }

                const customFieldsKey = cfg.customFieldsField ?? 'customFields';
                const customFields = getObjectValue(rec, customFieldsKey);

                let opCtx = ctx;
                if (cfg.channel) {
                    const req = await this.requestContextService.create({ apiType: ctx.apiType, channelOrToken: cfg.channel });
                    if (req) opCtx = req;
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
                        ok++;
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
                            } catch { /* channel assignment is best-effort */ }
                        }
                    }
                }

                ok++;
            } catch (e: unknown) {
                if (onRecordError) await onRecordError(step.key, getErrorMessage(e) || 'facetValueUpsert failed', rec as JsonObject, getErrorStack(e));
                fail++;
            }
        }
        return { ok, fail };
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
                        languageCode: String(t.languageCode) as LanguageCode,
                        name: String(t.name ?? name),
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
