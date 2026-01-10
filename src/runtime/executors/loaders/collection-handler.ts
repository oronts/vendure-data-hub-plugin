/**
 * Collection upsert loader handler
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    CollectionService,
    RequestContextService,
} from '@vendure/core';
import { LanguageCode } from '@vendure/common/lib/generated-types';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';

@Injectable()
export class CollectionHandler implements LoaderHandler {
    constructor(
        private collectionService: CollectionService,
        private requestContextService: RequestContextService,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;

        for (const rec of input) {
            try {
                const slug = String((rec as any)?.[(step.config as any)?.slugField ?? 'slug'] ?? '') || undefined;
                const name = String((rec as any)?.[(step.config as any)?.nameField ?? 'name'] ?? '') || undefined;
                const description = (rec as any)?.[(step.config as any)?.descriptionField ?? 'description'];
                const parentSlug = (rec as any)?.[(step.config as any)?.parentSlugField ?? 'parentSlug'] as string | undefined;

                if (!slug || !name) { fail++; continue; }

                let opCtx = ctx;
                const channel = (step.config as any)?.channel as string | undefined;
                if (channel) {
                    const req = await this.requestContextService.create({ apiType: ctx.apiType as any, channelOrToken: channel });
                    if (req) opCtx = req;
                }

                const existing = await this.collectionService.findOneBySlug(opCtx, slug);
                let collectionId: any;

                if (existing) {
                    const updated = await this.collectionService.update(opCtx, {
                        id: (existing as any).id,
                        translations: [{ languageCode: LanguageCode.en, name, slug, description }],
                    } as any);
                    collectionId = (updated as any)?.id;
                } else {
                    let parentId: any | undefined;
                    if (parentSlug) {
                        const parent = await this.collectionService.findOneBySlug(opCtx, parentSlug);
                        parentId = (parent as any)?.id;
                    }
                    const created = await this.collectionService.create(opCtx, {
                        parentId,
                        translations: [{ languageCode: LanguageCode.en, name, slug, description }],
                    } as any);
                    collectionId = (created as any)?.id;
                }

                const applyFilters = Boolean((step.config as any)?.applyFilters ?? false);
                if (applyFilters && collectionId) {
                    try {
                        await this.collectionService.triggerApplyFiltersJob(opCtx, { collectionIds: [collectionId] });
                    } catch { /* optional */ }
                }
                ok++;
            } catch (e: any) {
                if (onRecordError) await onRecordError(step.key, e?.message ?? 'collectionUpsert failed', rec as any);
                fail++;
            }
        }
        return { ok, fail };
    }

    async simulate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<Record<string, any>> {
        let exists = 0, missing = 0;
        for (const rec of input) {
            const slug = String((rec as any)?.[(step.config as any)?.slugField ?? 'slug'] ?? '') || undefined;
            if (!slug) continue;
            const c = await this.collectionService.findOneBySlug(ctx, slug);
            if (c) exists++; else missing++;
        }
        return { exists, missing };
    }
}
