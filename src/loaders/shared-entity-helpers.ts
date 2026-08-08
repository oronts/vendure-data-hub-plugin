import type { ID } from '@vendure/common/lib/shared-types';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import {
    AssetService,
    CollectionService,
    FacetValueService,
    ProductService,
    ProductVariantService,
    RequestContext,
} from '@vendure/core';
import type { DataHubLogger } from '../services/logger/datahub-logger';
import type { AssetsMode, FacetValuesMode, FeaturedAssetMode } from '../types';
import { downloadAsset } from '../utils/asset-download.utils';
import {
    createReadStreamFromBuffer,
    getAssetMimeType,
} from '../utils/asset-file.utils';
import { sanitizeUrlForLogging } from '../utils/url-sanitize.utils';

interface VendureUpdateInput {
    id: ID;
    facetValueIds?: ID[];
    assetIds?: ID[];
    featuredAssetId?: ID;
}

interface ExistingAsset {
    id: ID;
    name?: string;
}

type AssetOwnerService = ProductService | ProductVariantService | CollectionService;

const REMOTE_ASSET_NAME_PREFIX = 'data-hub-remote';
const REMOTE_ASSET_HASH_LENGTH = 24;

export function assertVendureMutationSucceeded(action: string, result: unknown): void {
    const values = Array.isArray(result) ? result : [result];
    for (const value of values) {
        if (!value || typeof value !== 'object' || !('errorCode' in value)) {
            continue;
        }
        const error = value as { errorCode?: unknown; message?: unknown };
        const detail = typeof error.message === 'string'
            ? error.message
            : String(error.errorCode ?? 'unknown error');
        throw new Error(`Failed to ${action}: ${detail}`);
    }
}

async function updateViaService(
    ctx: RequestContext,
    service: AssetOwnerService,
    input: VendureUpdateInput,
): Promise<void> {
    if (service instanceof ProductVariantService) {
        assertVendureMutationSucceeded('update product variant', await service.update(ctx, [input]));
        return;
    }
    if (service instanceof ProductService) {
        assertVendureMutationSucceeded('update product', await service.update(ctx, input));
        return;
    }
    assertVendureMutationSucceeded('update collection', await service.update(ctx, input));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toId(value: unknown): ID | undefined {
    return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function getExistingAssets(entity: unknown): ExistingAsset[] {
    if (!isRecord(entity) || !Array.isArray(entity.assets)) {
        return [];
    }
    return entity.assets.flatMap(value => {
        if (!isRecord(value)) {
            return [];
        }
        const nestedAsset = isRecord(value.asset) ? value.asset : value;
        const id = toId(nestedAsset.id) ?? toId(value.assetId);
        return id === undefined ? [] : [{
            id,
            name: typeof nestedAsset.name === 'string' ? nestedAsset.name : undefined,
        }];
    });
}

export async function resolveFacetValueIds(
    ctx: RequestContext,
    facetValueService: FacetValueService,
    codes: string[],
    _logger: DataHubLogger,
): Promise<ID[]> {
    if (codes.length === 0) {
        return [];
    }

    const ids = new Set<ID>();
    const facetValues = await facetValueService.findAll(ctx, ctx.languageCode);
    const qualifiedReferences = new Map<string, ID>();
    const unqualifiedReferences = new Map<string, Set<ID>>();
    for (const facetValue of facetValues) {
        const facetCode = facetValue.facet.code.trim().toLowerCase();
        const valueCode = facetValue.code.trim().toLowerCase();
        const valueName = facetValue.name.trim().toLowerCase();
        qualifiedReferences.set(`${facetCode}:${valueCode}`, facetValue.id);
        qualifiedReferences.set(`${facetCode}:${valueName}`, facetValue.id);
        for (const reference of new Set([valueCode, valueName])) {
            const candidates = unqualifiedReferences.get(reference) ?? new Set<ID>();
            candidates.add(facetValue.id);
            unqualifiedReferences.set(reference, candidates);
        }
    }

    const notFoundCodes: string[] = [];
    const ambiguousCodes: string[] = [];
    for (const code of codes) {
        const normalizedCode = code.trim().toLowerCase();
        if (normalizedCode.includes(':')) {
            const id = qualifiedReferences.get(normalizedCode);
            id === undefined ? notFoundCodes.push(code) : ids.add(id);
            continue;
        }
        const candidates = unqualifiedReferences.get(normalizedCode);
        if (!candidates || candidates.size === 0) {
            notFoundCodes.push(code);
        } else if (candidates.size > 1) {
            ambiguousCodes.push(code);
        } else {
            ids.add(candidates.values().next().value as ID);
        }
    }

    const errors: string[] = [];
    if (notFoundCodes.length > 0) {
        errors.push(`Facet values not found: ${notFoundCodes.join(', ')}`);
    }
    if (ambiguousCodes.length > 0) {
        errors.push(`Ambiguous facet values: ${ambiguousCodes.join(', ')}; use facet:value references`);
    }
    if (errors.length > 0) {
        throw new Error(errors.join('. '));
    }
    return [...ids];
}

function getRemoteAssetName(url: string): string {
    const hash = createHash('sha256').update(url).digest('hex').slice(0, REMOTE_ASSET_HASH_LENGTH);
    let extension = '';
    try {
        extension = extname(new URL(url).pathname).toLowerCase();
    } catch {
        // URL validation is handled by the downloader, so invalid input still fails there.
    }
    return `${REMOTE_ASSET_NAME_PREFIX}-${hash}${extension}`;
}

async function findAssetByUrl(
    ctx: RequestContext,
    assetService: AssetService,
    sourceUrl: string,
): Promise<{ id: ID } | null> {
    const result = await assetService.findAll(ctx, {
        filter: { name: { eq: getRemoteAssetName(sourceUrl) } },
        take: 1,
    });
    return result.items[0] ? { id: result.items[0].id } : null;
}

async function createAssetFromUrl(
    ctx: RequestContext,
    assetService: AssetService,
    url: string,
): Promise<ID> {
    const fileData = await downloadAsset(url, 'Loader asset download');
    if (!fileData) {
        throw new Error(`Failed to download asset from URL: ${sanitizeUrlForLogging(url)}`);
    }
    const result = await assetService.create(ctx, {
        file: {
            filename: getRemoteAssetName(url),
            mimetype: getAssetMimeType(url),
            createReadStream: () => createReadStreamFromBuffer(fileData),
        },
    });
    if ('id' in result) {
        return result.id;
    }
    const error = result as { message?: string; errorCode?: string };
    throw new Error(
        `Asset creation failed for ${sanitizeUrlForLogging(url)}: ` +
        `[${error.errorCode ?? 'UNKNOWN'}] ${error.message ?? 'Unknown error'}`,
    );
}

async function createAssetsFromUrls(
    ctx: RequestContext,
    assetService: AssetService,
    urls: string[],
): Promise<ID[]> {
    const assetIds: ID[] = [];
    for (const url of urls) {
        assetIds.push(await createAssetFromUrl(ctx, assetService, url));
    }
    return assetIds;
}

async function upsertAssetsByUrl(
    ctx: RequestContext,
    assetService: AssetService,
    urls: string[],
    existingAssets: ExistingAsset[],
    logger: DataHubLogger,
): Promise<ID[]> {
    const assetIds = existingAssets.map(asset => asset.id);
    const includedIds = new Set(assetIds.map(String));
    const existingAssetMap = new Map(
        existingAssets.flatMap(asset => asset.name ? [[asset.name, asset.id] as const] : []),
    );

    for (const url of new Set(urls)) {
        const assetName = getRemoteAssetName(url);
        let assetId = existingAssetMap.get(assetName);
        if (assetId !== undefined) {
            logger.debug(`Reusing existing asset ${assetId} for URL: ${sanitizeUrlForLogging(url)}`);
        } else {
            const existing = await findAssetByUrl(ctx, assetService, url);
            assetId = existing?.id ?? await createAssetFromUrl(ctx, assetService, url);
            existingAssetMap.set(assetName, assetId);
            logger.debug(
                `${existing ? 'Found existing' : 'Created new'} asset ${assetId} for URL: ${sanitizeUrlForLogging(url)}`,
            );
        }
        if (!includedIds.has(String(assetId))) {
            includedIds.add(String(assetId));
            assetIds.push(assetId);
        }
    }
    return assetIds;
}

export async function handleFacetValues(
    ctx: RequestContext,
    service: ProductService | ProductVariantService,
    facetValueService: FacetValueService,
    entityId: ID,
    facetValueCodes: string[],
    mode: FacetValuesMode = 'REPLACE_ALL',
    logger: DataHubLogger,
): Promise<void> {
    if (mode === 'SKIP') {
        logger.debug('Skipping facet value handling (mode: SKIP)');
        return;
    }
    if (facetValueCodes.length === 0) {
        if (mode === 'REPLACE_ALL') {
            await updateViaService(ctx, service, { id: entityId, facetValueIds: [] });
            logger.debug('Cleared all facet values (mode: REPLACE_ALL)');
        }
        return;
    }

    const resolvedIds = await resolveFacetValueIds(ctx, facetValueService, facetValueCodes, logger);
    if (mode === 'REPLACE_ALL') {
        await updateViaService(ctx, service, { id: entityId, facetValueIds: resolvedIds });
        return;
    }

    const entity = await service.findOne(ctx, entityId, ['facetValues']);
    const existingIds = entity?.facetValues?.map(facetValue => facetValue.id) ?? [];
    if (mode === 'MERGE') {
        await updateViaService(ctx, service, {
            id: entityId,
            facetValueIds: [...new Set([...existingIds, ...resolvedIds])],
        });
        return;
    }
    if (mode === 'REMOVE') {
        const removedIds = new Set(resolvedIds);
        await updateViaService(ctx, service, {
            id: entityId,
            facetValueIds: existingIds.filter(id => !removedIds.has(id)),
        });
        return;
    }
    throw new Error(`Unknown facet values mode: ${String(mode)}`);
}

export async function handleAssets(
    ctx: RequestContext,
    assetService: AssetService,
    service: AssetOwnerService,
    entityId: ID,
    assetUrls: string[],
    mode: AssetsMode = 'UPSERT_BY_URL',
    logger: DataHubLogger,
): Promise<void> {
    if (mode === 'SKIP') {
        logger.debug('Skipping asset handling (mode: SKIP)');
        return;
    }
    if (assetUrls.length === 0 && mode !== 'REPLACE_ALL') {
        logger.debug('No asset URLs provided, skipping');
        return;
    }

    const entity = await service.findOne(ctx, entityId, ['assets', 'assets.asset']);
    if (!entity) {
        throw new Error(`Entity ${entityId} not found, cannot handle assets`);
    }
    const existingAssets = getExistingAssets(entity);

    if (mode === 'UPSERT_BY_URL') {
        const assetIds = await upsertAssetsByUrl(ctx, assetService, assetUrls, existingAssets, logger);
        await updateViaService(ctx, service, { id: entityId, assetIds });
        return;
    }
    if (mode === 'REPLACE_ALL') {
        const assetIds = await createAssetsFromUrls(ctx, assetService, assetUrls);
        if (assetIds.length > 0 || existingAssets.length > 0) {
            await updateViaService(ctx, service, { id: entityId, assetIds });
        }
        return;
    }
    if (mode === 'APPEND_ONLY') {
        const assetIds = [
            ...existingAssets.map(asset => asset.id),
            ...await createAssetsFromUrls(ctx, assetService, assetUrls),
        ];
        await updateViaService(ctx, service, { id: entityId, assetIds });
        return;
    }
    throw new Error(`Unknown assets mode: ${String(mode)}`);
}

export async function handleFeaturedAsset(
    ctx: RequestContext,
    assetService: AssetService,
    service: ProductService | ProductVariantService,
    entityId: ID,
    featuredAssetUrl: string,
    mode: FeaturedAssetMode = 'UPSERT_BY_URL',
    logger: DataHubLogger,
): Promise<void> {
    if (!featuredAssetUrl || mode === 'SKIP') {
        return;
    }

    let assetId: ID;
    if (mode === 'UPSERT_BY_URL') {
        const existing = await findAssetByUrl(ctx, assetService, featuredAssetUrl);
        assetId = existing?.id ?? await createAssetFromUrl(ctx, assetService, featuredAssetUrl);
    } else if (mode === 'REPLACE') {
        assetId = await createAssetFromUrl(ctx, assetService, featuredAssetUrl);
    } else {
        throw new Error(`Unknown featured asset mode: ${String(mode)}`);
    }

    await updateViaService(ctx, service, { id: entityId, featuredAssetId: assetId });
    logger.debug(`Set featured asset ${assetId} on entity ${entityId}`);
}
