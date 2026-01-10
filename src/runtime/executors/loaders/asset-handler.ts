/**
 * Asset attach loader handler
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    ProductService,
    CollectionService,
    AssetService,
    RequestContextService,
} from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';

@Injectable()
export class AssetAttachHandler implements LoaderHandler {
    constructor(
        private productService: ProductService,
        private collectionService: CollectionService,
        private assetService: AssetService,
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
                const entity = (step.config as any)?.entity as string;
                const slug = (rec as any)?.[(step.config as any)?.slugField ?? 'slug'] as string | undefined;
                const assetId = (rec as any)?.[(step.config as any)?.assetIdField ?? 'assetId'] as any;

                if (!entity || !slug || !assetId) { fail++; continue; }

                let opCtx = ctx;
                const channel = (step.config as any)?.channel as string | undefined;
                if (channel) {
                    const req = await this.requestContextService.create({ apiType: ctx.apiType as any, channelOrToken: channel });
                    if (req) opCtx = req;
                }

                if (entity === 'product') {
                    const list = await this.productService.findAll(opCtx, { filter: { slug: { eq: slug } }, take: 1 } as any);
                    const product = list.items[0] as any;
                    if (!product) { fail++; continue; }
                    await this.assetService.updateFeaturedAsset(opCtx, product as any, { featuredAssetId: assetId } as any);
                } else if (entity === 'collection') {
                    const existing = await this.collectionService.findOneBySlug(opCtx, slug);
                    if (!existing) { fail++; continue; }
                    await this.assetService.updateFeaturedAsset(opCtx, existing as any, { featuredAssetId: assetId } as any);
                } else {
                    fail++;
                    continue;
                }
                ok++;
            } catch (e: any) {
                if (onRecordError) await onRecordError(step.key, e?.message ?? 'assetAttach failed', rec as any);
                fail++;
            }
        }
        return { ok, fail };
    }
}
