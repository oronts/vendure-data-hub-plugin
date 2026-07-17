import type {
    AssetService,
    ID,
    ProductService,
    ProductVariantService,
    RequestContext,
} from '@vendure/core';
import type { DataHubLogger } from '../../../services/logger/datahub-logger';
import type { AssetsMode, FeaturedAssetMode } from '../../../types';
import type { RecordObject } from '../../executor-types';
import { handleAssets, handleFeaturedAsset } from '../../../loaders/shared-helpers';

export interface EntityAssetInputConfig {
    readonly assetsField?: string;
    readonly assetsMode?: AssetsMode;
    readonly featuredAssetField?: string;
    readonly featuredAssetMode?: FeaturedAssetMode;
}

interface ApplyEntityAssetInputOptions {
    readonly ctx: RequestContext;
    readonly record: RecordObject;
    readonly config: EntityAssetInputConfig;
    readonly entityId: ID;
    readonly assetService: AssetService;
    readonly entityService: ProductService | ProductVariantService;
    readonly logger: DataHubLogger;
}

export async function applyEntityAssetInput(
    options: ApplyEntityAssetInputOptions,
): Promise<void> {
    const {
        ctx,
        record,
        config,
        entityId,
        assetService,
        entityService,
        logger,
    } = options;
    const assetsField = config.assetsField ?? 'assetUrls';
    if (Object.prototype.hasOwnProperty.call(record, assetsField)) {
        const assetUrls = parseAssetUrls(record[assetsField], assetsField);
        await handleAssets(
            ctx,
            assetService,
            entityService,
            entityId,
            assetUrls,
            config.assetsMode ?? 'UPSERT_BY_URL',
            logger,
        );
    }

    const featuredAssetField = config.featuredAssetField ?? 'featuredAssetUrl';
    if (Object.prototype.hasOwnProperty.call(record, featuredAssetField)) {
        const rawUrl = record[featuredAssetField];
        if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
            throw new Error(`Field "${featuredAssetField}" must contain a non-empty asset URL`);
        }
        await handleFeaturedAsset(
            ctx,
            assetService,
            entityService,
            entityId,
            rawUrl,
            config.featuredAssetMode ?? 'UPSERT_BY_URL',
            logger,
        );
    }
}

function parseAssetUrls(value: unknown, fieldName: string): string[] {
    if (!Array.isArray(value) || !value.every(url =>
        typeof url === 'string' && url.trim().length > 0
    )) {
        throw new Error(`Field "${fieldName}" must contain an array of non-empty asset URLs`);
    }
    return value;
}
