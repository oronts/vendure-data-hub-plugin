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
import { getErrorMessage } from '../../../utils/error.utils';

interface FacetUpsertConfig {
    channel?: string;
    codeField?: string;
    nameField?: string;
    privateField?: string;
}

interface FacetValueUpsertConfig {
    channel?: string;
    facetCodeField?: string;
    codeField?: string;
    nameField?: string;
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

                let opCtx = ctx;
                if (cfg.channel) {
                    const req = await this.requestContextService.create({ apiType: ctx.apiType, channelOrToken: cfg.channel });
                    if (req) opCtx = req;
                }

                const existing = await this.facetService.findByCode(opCtx, code, opCtx.languageCode || LanguageCode.en);

                if (existing) {
                    await this.facetService.update(opCtx, {
                        id: existing.id,
                        isPrivate: cfg.privateField ? Boolean(record[cfg.privateField]) : existing.isPrivate,
                        translations: [{
                            languageCode: opCtx.languageCode || LanguageCode.en,
                            name,
                        }],
                    });
                } else {
                    await this.facetService.create(opCtx, {
                        code,
                        isPrivate: cfg.privateField ? Boolean(record[cfg.privateField]) : false,
                        translations: [{
                            languageCode: opCtx.languageCode || LanguageCode.en,
                            name,
                        }],
                    });
                }
                ok++;
            } catch (e: unknown) {
                if (onRecordError) await onRecordError(step.key, getErrorMessage(e) || 'facetUpsert failed', rec as JsonObject);
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

                if (existing) {
                    await this.facetValueService.update(opCtx, {
                        id: existing.id,
                        translations: [{
                            languageCode: opCtx.languageCode || LanguageCode.en,
                            name,
                        }],
                    });
                } else {
                    await this.facetValueService.create(opCtx, facet, {
                        code,
                        translations: [{
                            languageCode: opCtx.languageCode || LanguageCode.en,
                            name,
                        }],
                    });
                }
                ok++;
            } catch (e: unknown) {
                if (onRecordError) await onRecordError(step.key, getErrorMessage(e) || 'facetValueUpsert failed', rec as JsonObject);
                fail++;
            }
        }
        return { ok, fail };
    }
}
