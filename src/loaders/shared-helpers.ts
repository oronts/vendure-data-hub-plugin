import { ID, RequestContext, FacetValueService, ProductVariantService, ProductService, AssetService, CollectionService, Asset } from '@vendure/core';
import { Readable } from 'stream';
import { slugify } from '../operators/helpers';
import { DataHubLogger } from '../services/logger';
import { RecordObject } from '../runtime/executor-types';
import { JsonValue, FacetValuesMode, AssetsMode, FeaturedAssetMode } from '../types/index';
import { assertUrlSafe } from '../utils/url-security.utils';
import { HTTP } from '../../shared/constants/index';
import { EXTENSION_MIME_MAP, CONTENT_TYPES } from '../constants/services';
import { sleep } from '../runtime/utils';
import { getNestedValue } from '../utils/object-path.utils';

export { slugify };

// =============================================================================
// Vendure Service Helpers
// =============================================================================

/**
 * Update an entity via Vendure service, handling the signature difference between
 * ProductService.update(ctx, input) and ProductVariantService.update(ctx, input[]).
 */
async function updateViaService(
    ctx: RequestContext,
    service: ProductService | ProductVariantService | CollectionService,
    input: Record<string, unknown>,
): Promise<void> {
    if (service instanceof ProductVariantService) {
        await (service as ProductVariantService).update(ctx, [input as any]);
    } else {
        await (service as ProductService | CollectionService).update(ctx, input as any);
    }
}

// =============================================================================
// Record Field Accessors
// =============================================================================

export function getStringValue(record: RecordObject, key: string): string | undefined {
    const value = key.includes('.') ? getNestedValue(record as Record<string, unknown>, key) : record[key];
    if (typeof value === 'string') {
        return value || undefined;
    }
    if (value !== null && value !== undefined) {
        return String(value) || undefined;
    }
    return undefined;
}

export function getNumberValue(record: RecordObject, key: string): number | undefined {
    const value = key.includes('.') ? getNestedValue(record as Record<string, unknown>, key) : record[key];
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string') {
        const num = Number(value);
        return Number.isNaN(num) ? undefined : num;
    }
    return undefined;
}

export function getObjectValue(record: RecordObject, key: string): Record<string, JsonValue> | undefined {
    const value = key.includes('.') ? getNestedValue(record as Record<string, unknown>, key) : record[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, JsonValue>;
    }
    return undefined;
}

export function getIdValue(record: RecordObject, key: string): ID | undefined {
    const value = key.includes('.') ? getNestedValue(record as Record<string, unknown>, key) : record[key];
    if (typeof value === 'string' || typeof value === 'number') {
        return value;
    }
    return undefined;
}

export function getArrayValue<T>(record: RecordObject, key: string): T[] | undefined {
    const value = key.includes('.') ? getNestedValue(record as Record<string, unknown>, key) : record[key];
    if (!value || !Array.isArray(value)) {
        return undefined;
    }
    return value as T[];
}

export function isRecoverableError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
            message.includes('timeout') ||
            message.includes('connection') ||
            message.includes('temporarily')
        );
    }
    return false;
}

export function shouldUpdateField(
    field: string,
    updateOnlyFields?: string[],
): boolean {
    if (!updateOnlyFields || updateOnlyFields.length === 0) {
        return true;
    }
    return updateOnlyFields.includes(field);
}

export interface ConfigurableOperationInput {
    code: string;
    args?: Record<string, unknown>;
}

export function buildConfigurableOperation(
    input: ConfigurableOperationInput,
): { code: string; arguments: Array<{ name: string; value: string }> } {
    return {
        code: input.code,
        arguments: Object.entries(input.args || {}).map(([name, value]) => ({
            name,
            value: typeof value === 'string' ? value : JSON.stringify(value),
        })),
    };
}

export function buildConfigurableOperations(
    inputs: ConfigurableOperationInput[],
): Array<{ code: string; arguments: Array<{ name: string; value: string }> }> {
    return inputs.map(input => buildConfigurableOperation(input));
}

export async function findVariantBySku(
    productVariantService: ProductVariantService,
    ctx: RequestContext,
    sku: string,
): Promise<{ id: ID } | null> {
    const result = await productVariantService.findAll(ctx, {
        filter: { sku: { eq: sku } },
        take: 1,
    });
    return result.items[0] ? { id: result.items[0].id } : null;
}

export async function resolveFacetValueIds(
    ctx: RequestContext,
    facetValueService: FacetValueService,
    codes: string[],
    logger: DataHubLogger,
): Promise<ID[]> {
    if (!codes || codes.length === 0) {
        return [];
    }

    const ids: ID[] = [];
    const facetValues = await facetValueService.findAll(ctx.languageCode);

    // Build a map for efficient lookup (case-insensitive)
    const codeMap = new Map<string, ID>();
    const nameMap = new Map<string, ID>();
    for (const fv of facetValues) {
        codeMap.set(fv.code.toLowerCase(), fv.id);
        nameMap.set(fv.name.toLowerCase(), fv.id);
    }

    const notFoundCodes: string[] = [];

    for (const code of codes) {
        const normalizedCode = code.toLowerCase();
        const id = codeMap.get(normalizedCode) ?? nameMap.get(normalizedCode);
        if (id) {
            ids.push(id);
        } else {
            notFoundCodes.push(code);
        }
    }

    // Log all not-found codes at once to reduce log spam
    if (notFoundCodes.length > 0) {
        logger.warn(`Facet values not found: ${notFoundCodes.join(', ')}`);
    }

    return ids;
}

// =============================================================================
// Asset Helper Functions
// =============================================================================

/**
 * Download file from URL with retry logic and SSRF protection
 */
async function downloadFile(url: string): Promise<Buffer | null> {
    try {
        await assertUrlSafe(url);
    } catch {
        return null;
    }

    for (let attempt = 0; attempt <= HTTP.MAX_RETRIES; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), HTTP.TIMEOUT_MS);

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                if (attempt === HTTP.MAX_RETRIES) return null;
                await sleep(HTTP.RETRY_DELAY_MS * (attempt + 1));
                continue;
            }

            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch {
            if (attempt === HTTP.MAX_RETRIES) return null;
            await sleep(HTTP.RETRY_DELAY_MS * (attempt + 1));
        }
    }
    return null;
}

/**
 * Convert Buffer to Readable stream for AssetService
 */
function bufferToStream(buffer: Buffer): Readable {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    return stream;
}

/**
 * Extract filename from URL
 */
function extractFilenameFromUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const parts = pathname.split('/');
        const filename = parts[parts.length - 1];
        return filename || `asset-${Date.now()}`;
    } catch {
        return `asset-${Date.now()}`;
    }
}

/**
 * Get MIME type from URL extension using the centralized EXTENSION_MIME_MAP.
 */
function getMimeType(url: string): string {
    const ext = url.split('.').pop()?.toLowerCase();
    return (ext ? EXTENSION_MIME_MAP[`.${ext}`] : undefined) ?? CONTENT_TYPES.OCTET_STREAM;
}

/**
 * Find asset by source URL
 */
async function findAssetBySource(
    ctx: RequestContext,
    assetService: AssetService,
    sourceUrl: string,
): Promise<Asset | null> {
    const result = await assetService.findAll(ctx, {
        filter: { source: { eq: sourceUrl } },
        take: 1,
    });
    return result.items[0] || null;
}

/**
 * Create a single asset from URL
 */
async function createAssetFromUrl(
    ctx: RequestContext,
    assetService: AssetService,
    url: string,
    logger: DataHubLogger,
): Promise<ID | undefined> {
    try {
        const fileData = await downloadFile(url);
        if (!fileData) {
            logger.warn(`Failed to download asset from URL: ${url}`);
            return undefined;
        }

        const filename = extractFilenameFromUrl(url);
        const mimeType = getMimeType(url);

        const file = {
            filename,
            mimetype: mimeType,
            createReadStream: () => bufferToStream(fileData),
        };

        const result = await assetService.create(ctx, { file });

        if ('id' in result) {
            return result.id;
        } else {
            logger.warn(`Asset creation failed for ${url}: ${(result as any).message || 'Unknown error'}`);
            return undefined;
        }
    } catch (error) {
        logger.warn(`Error creating asset from ${url}: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}

/**
 * Create multiple assets from URLs (for REPLACE_ALL and APPEND_ONLY modes)
 */
async function createAssetsFromUrls(
    ctx: RequestContext,
    assetService: AssetService,
    urls: string[],
    logger: DataHubLogger,
): Promise<ID[]> {
    const assetIds: ID[] = [];

    for (const url of urls) {
        const assetId = await createAssetFromUrl(ctx, assetService, url, logger);
        if (assetId) {
            assetIds.push(assetId);
        }
    }

    return assetIds;
}

/**
 * Upsert assets by URL - reuse existing if source matches, create if not
 */
async function upsertAssetsByUrl(
    ctx: RequestContext,
    assetService: AssetService,
    urls: string[],
    existingAssets: any[],
    logger: DataHubLogger,
): Promise<ID[]> {
    const assetIds: ID[] = [];
    const existingAssetMap = new Map<string, ID>();

    // Build map of existing assets by source URL
    for (const assetWrapper of existingAssets) {
        const asset = assetWrapper.asset || assetWrapper;
        if (asset?.source) {
            existingAssetMap.set(asset.source, asset.id);
        }
    }

    for (const url of urls) {
        // Check if we already have an asset with this source URL
        const existingId = existingAssetMap.get(url);
        if (existingId) {
            assetIds.push(existingId);
            logger.debug(`Reusing existing asset ${existingId} for URL: ${url}`);
        } else {
            // Need to check if asset exists in DB (might not be attached to this entity)
            const existing = await findAssetBySource(ctx, assetService, url);
            if (existing) {
                assetIds.push(existing.id);
                logger.debug(`Found existing asset ${existing.id} for URL: ${url}`);
            } else {
                // Create new asset
                const assetId = await createAssetFromUrl(ctx, assetService, url, logger);
                if (assetId) {
                    assetIds.push(assetId);
                    logger.debug(`Created new asset ${assetId} for URL: ${url}`);
                }
            }
        }
    }

    return assetIds;
}

// =============================================================================
// Nested Entity Mode Handlers
// =============================================================================

/**
 * Handle facet values with configurable mode.
 * Prevents unintended overwrites and provides full control over merge strategy.
 * Shared between Product and ProductVariant loaders.
 *
 * @param ctx Request context
 * @param service ProductService or ProductVariantService
 * @param facetValueService FacetValueService for resolving facet value codes
 * @param entityId Product or ProductVariant ID
 * @param facetValueCodes Array of facet value codes from the record
 * @param mode How to handle facet values (REPLACE_ALL, MERGE, REMOVE, SKIP)
 * @param logger Logger for diagnostic messages
 */
export async function handleFacetValues(
    ctx: RequestContext,
    service: ProductService | ProductVariantService,
    facetValueService: FacetValueService,
    entityId: ID,
    facetValueCodes: string[],
    mode: FacetValuesMode = 'REPLACE_ALL',
    logger: DataHubLogger,
): Promise<void> {
    if (!facetValueCodes || facetValueCodes.length === 0) {
        logger.debug(`No facet value codes provided, skipping`);
        return;
    }

    // SKIP mode - do nothing
    if (mode === 'SKIP') {
        logger.debug(`Skipping facet value handling (mode: SKIP)`);
        return;
    }

    // Resolve facet value codes to IDs
    const newFacetValueIds = await resolveFacetValueIds(ctx, facetValueService, facetValueCodes, logger);

    if (newFacetValueIds.length === 0) {
        logger.warn(`No valid facet values found from codes: ${facetValueCodes.join(', ')}`);
        return;
    }

    // REPLACE_ALL mode - replace all facet values (current behavior)
    if (mode === 'REPLACE_ALL') {
        await updateViaService(ctx, service, { id: entityId, facetValueIds: newFacetValueIds });
        logger.debug(`Replaced all facet values with ${newFacetValueIds.length} values (mode: REPLACE_ALL)`);
        return;
    }

    // For MERGE and REMOVE modes, we need to fetch existing facet values
    const entity = await service.findOne(ctx, entityId, ['facetValues']);
    const existingIds = (entity?.facetValues?.map((fv: any) => fv.id) ?? []) as ID[];

    // MERGE mode - add new, keep existing
    if (mode === 'MERGE') {
        // Deduplicate by converting to Set and back to array
        const mergedIds = [...new Set([...existingIds, ...newFacetValueIds])];
        const addedCount = mergedIds.length - existingIds.length;

        await updateViaService(ctx, service, { id: entityId, facetValueIds: mergedIds });
        logger.debug(
            `Merged facet values: ${existingIds.length} existing + ${newFacetValueIds.length} new = ${mergedIds.length} total (${addedCount} added, mode: MERGE)`,
        );
        return;
    }

    // REMOVE mode - remove specified facet values
    if (mode === 'REMOVE') {
        const newIdSet = new Set(newFacetValueIds);
        const remainingIds = existingIds.filter(id => !newIdSet.has(id));
        const removedCount = existingIds.length - remainingIds.length;

        await updateViaService(ctx, service, { id: entityId, facetValueIds: remainingIds });
        logger.debug(
            `Removed ${removedCount} facet values: ${existingIds.length} existing - ${removedCount} removed = ${remainingIds.length} remaining (mode: REMOVE)`,
        );
        return;
    }
}


/**
 * Handle assets with configurable mode.
 * Provides control over how assets are managed for products/variants/collections.
 *
 * @param ctx Request context
 * @param assetService AssetService for asset creation/management
 * @param service ProductService or ProductVariantService or CollectionService
 * @param entityId Product or ProductVariant or Collection ID
 * @param assetUrls Array of asset URLs to upload/attach
 * @param mode How to handle assets (UPSERT_BY_URL, REPLACE_ALL, APPEND_ONLY, SKIP)
 * @param logger Logger for diagnostic messages
 */
export async function handleAssets(
    ctx: RequestContext,
    assetService: AssetService,
    service: ProductService | ProductVariantService | CollectionService,
    entityId: ID,
    assetUrls: string[],
    mode: AssetsMode = 'UPSERT_BY_URL',
    logger: DataHubLogger,
): Promise<void> {
    if (!assetUrls || assetUrls.length === 0) {
        logger.debug(`No asset URLs provided, skipping`);
        return;
    }

    // SKIP mode - do nothing
    if (mode === 'SKIP') {
        logger.debug(`Skipping asset handling (mode: SKIP)`);
        return;
    }

    try {
        // Fetch the entity to get current assets
        const entity = await service.findOne(ctx, entityId, ['assets', 'assets.asset']);
        if (!entity) {
            logger.warn(`Entity ${entityId} not found, cannot handle assets`);
            return;
        }

        const existingAssets = (entity as any).assets || [];
        logger.debug(`Entity ${entityId} has ${existingAssets.length} existing assets`);

        switch (mode) {
            case 'UPSERT_BY_URL': {
                // Match by source URL, create if not exists
                const assetIds = await upsertAssetsByUrl(ctx, assetService, assetUrls, existingAssets, logger);
                if (assetIds.length > 0) {
                    await updateViaService(ctx, service, { id: entityId, assetIds });
                    logger.debug(
                        `UPSERT_BY_URL: Set ${assetIds.length} assets on entity ${entityId} (${assetUrls.length} URLs processed)`,
                    );
                }
                break;
            }

            case 'REPLACE_ALL': {
                // Remove all existing, create from URLs
                const assetIds = await createAssetsFromUrls(ctx, assetService, assetUrls, logger);
                if (assetIds.length > 0 || existingAssets.length > 0) {
                    await updateViaService(ctx, service, { id: entityId, assetIds });
                    logger.debug(
                        `REPLACE_ALL: Replaced ${existingAssets.length} existing with ${assetIds.length} new assets on entity ${entityId}`,
                    );
                }
                break;
            }

            case 'APPEND_ONLY': {
                // Always create new assets, append to existing
                const newAssetIds = await createAssetsFromUrls(ctx, assetService, assetUrls, logger);
                const existingIds = existingAssets.map((a: any) => a.assetId || a.asset?.id).filter(Boolean);
                const allAssetIds = [...existingIds, ...newAssetIds];
                await updateViaService(ctx, service, { id: entityId, assetIds: allAssetIds });
                logger.debug(
                    `APPEND_ONLY: Added ${newAssetIds.length} new assets to ${existingIds.length} existing = ${allAssetIds.length} total on entity ${entityId}`,
                );
                break;
            }

            default:
                logger.warn(`Unknown assets mode: ${mode}, skipping`);
        }
    } catch (error) {
        // Log error but don't fail the pipeline
        logger.error(`Failed to handle assets for entity ${entityId}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Handle featured asset with configurable mode.
 * Provides control over how the featured/main asset is set for products/variants.
 *
 * @param ctx Request context
 * @param assetService AssetService for asset creation
 * @param service ProductService or ProductVariantService
 * @param entityId Product or ProductVariant ID
 * @param featuredAssetUrl URL of the featured asset to set
 * @param mode How to handle featured asset (UPSERT_BY_URL, REPLACE, SKIP)
 * @param logger Logger for diagnostic messages
 */
export async function handleFeaturedAsset(
    ctx: RequestContext,
    assetService: AssetService,
    service: ProductService | ProductVariantService,
    entityId: ID,
    featuredAssetUrl: string,
    mode: FeaturedAssetMode = 'UPSERT_BY_URL',
    logger: DataHubLogger,
): Promise<void> {
    if (!featuredAssetUrl) {
        logger.debug(`No featured asset URL provided, skipping`);
        return;
    }

    // SKIP mode - do nothing
    if (mode === 'SKIP') {
        logger.debug(`Skipping featured asset handling (mode: SKIP)`);
        return;
    }

    try {
        let assetId: ID | undefined;

        switch (mode) {
            case 'UPSERT_BY_URL': {
                // Check if asset with this source URL exists, reuse if so
                const existing = await findAssetBySource(ctx, assetService, featuredAssetUrl);
                if (existing) {
                    assetId = existing.id;
                    logger.debug(`UPSERT_BY_URL: Reusing existing asset ${assetId} for URL: ${featuredAssetUrl}`);
                } else {
                    assetId = await createAssetFromUrl(ctx, assetService, featuredAssetUrl, logger);
                    if (assetId) {
                        logger.debug(`UPSERT_BY_URL: Created new asset ${assetId} from URL: ${featuredAssetUrl}`);
                    }
                }
                break;
            }

            case 'REPLACE': {
                // Always create new asset
                assetId = await createAssetFromUrl(ctx, assetService, featuredAssetUrl, logger);
                if (assetId) {
                    logger.debug(`REPLACE: Created new asset ${assetId} from URL: ${featuredAssetUrl}`);
                }
                break;
            }

            default:
                logger.warn(`Unknown featured asset mode: ${mode}, skipping`);
                return;
        }

        // Set as featured asset if we got an asset ID
        if (assetId) {
            await updateViaService(ctx, service, { id: entityId, featuredAssetId: assetId });
            logger.debug(`Set featured asset ${assetId} on entity ${entityId}`);
        } else {
            logger.warn(`Failed to create/find asset for URL: ${featuredAssetUrl}`);
        }
    } catch (error) {
        // Log error but don't fail the pipeline
        logger.error(
            `Failed to handle featured asset for entity ${entityId}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

