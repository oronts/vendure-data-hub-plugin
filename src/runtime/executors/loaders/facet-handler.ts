import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    FacetService,
    FacetValueService,
    RequestContextService,
    LanguageCode,
    TransactionalConnection,
} from '@vendure/core';
import { JsonObject, PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { LoadStrategy } from '../../../constants/enums';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { getObjectValue } from '../../../loaders/shared-helpers';

interface FacetUpsertConfig {
    channel?: string;
    codeField?: string;
    nameField?: string;
    privateField?: string;
    customFieldsField?: string;
    strategy?: LoadStrategy;
}

interface FacetValueUpsertConfig {
    channel?: string;
    facetCodeField?: string;
    codeField?: string;
    nameField?: string;
    customFieldsField?: string;
    strategy?: LoadStrategy;
}

interface FacetRecord {
    [key: string]: unknown;
}

@Injectable()
export class FacetHandler implements LoaderHandler {
    constructor(
        private facetService: FacetService,
        private requestContextService: RequestContextService,
        private connection: TransactionalConnection,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;
        const cfg = (step.config ?? {}) as FacetUpsertConfig;

        for (const rec of input) {
            try {
                const record = rec as FacetRecord;
                const codeField = cfg.codeField ?? 'code';
                const nameField = cfg.nameField ?? 'name';
                const code = String(record[codeField] ?? '');
                const name = String(record[nameField] ?? code);

                if (!code) { fail++; continue; }

                const customFieldsKey = cfg.customFieldsField ?? 'customFields';
                const customFields = getObjectValue(rec, customFieldsKey);

                let opCtx = ctx;
                if (cfg.channel) {
                    const req = await this.requestContextService.create({ apiType: ctx.apiType, channelOrToken: cfg.channel });
                    if (req) opCtx = req;
                }

                const existing = await this.facetService.findByCode(opCtx, code, opCtx.languageCode || LanguageCode.en);
                const strategy = cfg.strategy ?? LoadStrategy.UPSERT;

                if (existing) {
                    if (strategy === LoadStrategy.CREATE) {
                        ok++;
                        continue;
                    }
                    await this.facetService.update(opCtx, {
                        id: existing.id,
                        isPrivate: cfg.privateField ? Boolean(record[cfg.privateField]) : existing.isPrivate,
                        translations: [{
                            languageCode: opCtx.languageCode || LanguageCode.en,
                            name,
                        }],
                        ...(customFields ? { customFields } : {}),
                    });
                } else {
                    if (strategy === LoadStrategy.UPDATE) {
                        fail++;
                        if (onRecordError) await onRecordError(step.key, `Facet not found for update: ${code}`, rec as JsonObject);
                        continue;
                    }
                    await this.facetService.create(opCtx, {
                        code,
                        isPrivate: cfg.privateField ? Boolean(record[cfg.privateField]) : false,
                        translations: [{
                            languageCode: opCtx.languageCode || LanguageCode.en,
                            name,
                        }],
                        ...(customFields ? { customFields } : {}),
                    });
                }
                ok++;
            } catch (e: unknown) {
                if (onRecordError) await onRecordError(step.key, getErrorMessage(e) || 'facetUpsert failed', rec as JsonObject, getErrorStack(e));
                fail++;
            }
        }
        return { ok, fail };
    }
}

@Injectable()
export class FacetValueHandler implements LoaderHandler {
    constructor(
        private facetService: FacetService,
        private facetValueService: FacetValueService,
        private requestContextService: RequestContextService,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;
        const cfg = (step.config ?? {}) as FacetValueUpsertConfig;

        for (const rec of input) {
            try {
                const record = rec as FacetRecord;
                const facetCodeField = cfg.facetCodeField ?? 'facetCode';
                const codeField = cfg.codeField ?? 'code';
                const nameField = cfg.nameField ?? 'name';
                const facetCode = String(record[facetCodeField] ?? '');
                const code = String(record[codeField] ?? '');
                const name = String(record[nameField] ?? code);

                if (!facetCode || !code) { fail++; continue; }

                const customFieldsKey = cfg.customFieldsField ?? 'customFields';
                const customFields = getObjectValue(rec, customFieldsKey);

                let opCtx = ctx;
                if (cfg.channel) {
                    const req = await this.requestContextService.create({ apiType: ctx.apiType, channelOrToken: cfg.channel });
                    if (req) opCtx = req;
                }

                const facet = await this.facetService.findByCode(opCtx, facetCode, opCtx.languageCode || LanguageCode.en);
                if (!facet) {
                    if (onRecordError) await onRecordError(step.key, `Facet not found: ${facetCode}`, rec as JsonObject);
                    fail++;
                    continue;
                }

                const existingValues = await this.facetValueService.findByFacetId(opCtx, facet.id);
                const existing = existingValues.find(v => v.code === code);
                const strategy = cfg.strategy ?? LoadStrategy.UPSERT;

                if (existing) {
                    if (strategy === LoadStrategy.CREATE) {
                        ok++;
                        continue;
                    }
                    await this.facetValueService.update(opCtx, {
                        id: existing.id,
                        translations: [{
                            languageCode: opCtx.languageCode || LanguageCode.en,
                            name,
                        }],
                        ...(customFields ? { customFields } : {}),
                    });
                } else {
                    if (strategy === LoadStrategy.UPDATE) {
                        fail++;
                        if (onRecordError) await onRecordError(step.key, `Facet value not found for update: ${code}`, rec as JsonObject);
                        continue;
                    }
                    await this.facetValueService.create(opCtx, facet, {
                        code,
                        translations: [{
                            languageCode: opCtx.languageCode || LanguageCode.en,
                            name,
                        }],
                        ...(customFields ? { customFields } : {}),
                    });
                }
                ok++;
            } catch (e: unknown) {
                if (onRecordError) await onRecordError(step.key, getErrorMessage(e) || 'facetValueUpsert failed', rec as JsonObject, getErrorStack(e));
                fail++;
            }
        }
        return { ok, fail };
    }
}
