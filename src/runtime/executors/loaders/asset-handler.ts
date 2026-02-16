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
    ID,
    EntityWithAssets,
} from '@vendure/core';
import { JsonObject, PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { getErrorMessage } from '../../../utils/error.utils';

/**
 * Configuration for asset attachment step
 */
interface AssetAttachConfig {
    entity?: string;
    slugField?: string;
    assetIdField?: string;
    channel?: string;
}

/**
 * Record with dynamic field access
 */
interface AssetAttachRecord {
    [key: string]: unknown;
}

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
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;
        const cfg = (step.config ?? {}) as AssetAttachConfig;

        for (const rec of input) {
            try {
                const record = rec as AssetAttachRecord;
                const entity = cfg.entity;
                const slugField = cfg.slugField ?? 'slug';
                const assetIdField = cfg.assetIdField ?? 'assetId';
                const slug = record[slugField] as string | undefined;
                const assetId = record[assetIdField] as ID | undefined;

                if (!entity || !slug || !assetId) {
                    if (onRecordError) await onRecordError(step.key, `Missing required field: ${!entity ? 'entity' : !slug ? slugField : assetIdField}`, rec as JsonObject);
                    fail++;
                    continue;
                }

                let opCtx = ctx;
                const channel = cfg.channel;
                if (channel) {
                    const req = await this.requestContextService.create({ apiType: ctx.apiType, channelOrToken: channel });
                    if (req) opCtx = req;
                }

                if (entity === 'product') {
                    const list = await this.productService.findAll(opCtx, { filter: { slug: { eq: slug } }, take: 1 });
                    const product = list.items[0];
                    if (!product) {
                        if (onRecordError) await onRecordError(step.key, `Product not found: ${slug}`, rec as JsonObject);
                        fail++;
                        continue;
                    }
                    await this.assetService.updateFeaturedAsset(opCtx, product as unknown as EntityWithAssets, { featuredAssetId: assetId });
                } else if (entity === 'collection') {
                    const existing = await this.collectionService.findOneBySlug(opCtx, slug);
                    if (!existing) {
                        if (onRecordError) await onRecordError(step.key, `Collection not found: ${slug}`, rec as JsonObject);
                        fail++;
                        continue;
                    }
                    await this.assetService.updateFeaturedAsset(opCtx, existing as unknown as EntityWithAssets, { featuredAssetId: assetId });
                } else {
                    if (onRecordError) await onRecordError(step.key, `Unsupported entity type: ${entity}`, rec as JsonObject);
                    fail++;
                    continue;
                }
                ok++;
            } catch (e: unknown) {
                if (onRecordError) await onRecordError(step.key, getErrorMessage(e) || 'assetAttach failed', rec as JsonObject);
                fail++;
            }
        }
        return { ok, fail };
    }
}
