/**
 * Asset attach loader handler
 */
import { Injectable } from '@nestjs/common';
import {
    ChannelService,
    RequestContext,
    ProductService,
    CollectionService,
    AssetService,
    RequestContextService,
    ID,
    EntityWithAssets,
} from '@vendure/core';
import { createChannelCodeRequestContext } from '../../helpers/channel-request-context';
import { JsonObject, PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, LoaderExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { getStringValue } from '../../../loaders/shared-helpers';
import { VendureEntityType } from '../../../constants/enums';

/**
 * Configuration for asset attachment step
 */
interface AssetAttachConfig {
    entity?: VendureEntityType.PRODUCT | VendureEntityType.COLLECTION;
    slugField?: string;
    assetIdField?: string;
    channel?: string;
}

@Injectable()
export class AssetAttachHandler implements LoaderHandler {
    constructor(
        private productService: ProductService,
        private collectionService: CollectionService,
        private assetService: AssetService,
        private requestContextService: RequestContextService,
        private channelService: ChannelService,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<LoaderExecutionResult> {
        let ok = 0, fail = 0;
        const cfg = (step.config ?? {}) as AssetAttachConfig;

        for (const rec of input) {
            try {
                const entity = cfg.entity;
                const slugField = cfg.slugField ?? 'slug';
                const assetIdField = cfg.assetIdField ?? 'assetId';
                const slug = getStringValue(rec, slugField);
                const assetId = getStringValue(rec, assetIdField) as ID | undefined;

                if (!entity || !slug || !assetId) {
                    if (onRecordError) await onRecordError(step.key, `Missing required field: ${!entity ? 'entity' : !slug ? slugField : assetIdField}`, rec as JsonObject);
                    fail++;
                    continue;
                }

                let opCtx = ctx;
                const channel = cfg.channel;
                if (channel) {
                    opCtx = await createChannelCodeRequestContext(
                        this.requestContextService,
                        this.channelService,
                        ctx,
                        channel,
                    );
                }

                if (entity === VendureEntityType.PRODUCT) {
                    const list = await this.productService.findAll(opCtx, { filter: { slug: { eq: slug } }, take: 1 });
                    const product = list.items[0];
                    if (!product) {
                        if (onRecordError) await onRecordError(step.key, `Product not found: ${slug}`, rec as JsonObject);
                        fail++;
                        continue;
                    }
                    await this.assetService.updateFeaturedAsset(opCtx, product as unknown as EntityWithAssets, { featuredAssetId: assetId });
                } else if (entity === VendureEntityType.COLLECTION) {
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
                if (onRecordError) await onRecordError(step.key, getErrorMessage(e) || 'assetAttach failed', rec as JsonObject, getErrorStack(e));
                fail++;
            }
        }
        return { ok, fail, skipped: 0 };
    }
}
