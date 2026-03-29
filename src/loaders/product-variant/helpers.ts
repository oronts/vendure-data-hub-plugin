import { ID, RequestContext, ProductOptionService, ProductVariantService, ProductOption } from '@vendure/core';
import { DataHubLogger } from '../../services/logger';
import { OptionsMode } from '../../types/index';
import { getErrorMessage } from '../../utils/error.utils';

export { isRecoverableError, shouldUpdateField } from '../shared-helpers';

/**
 * Resolve option codes to option IDs by querying ProductOptionService.
 * Looks up each code via filtered query for exact match.
 * Falls back to a broad search with case-insensitive name matching if exact code match fails.
 */
async function resolveOptionIds(
    ctx: RequestContext,
    optionService: ProductOptionService,
    optionCodes: string[],
    logger: DataHubLogger,
): Promise<ID[]> {
    if (!optionCodes || optionCodes.length === 0) return [];

    const ids: ID[] = [];
    const notFoundCodes: string[] = [];

    for (const code of optionCodes) {
        if (!code) continue;

        try {
            // Try exact code match first (most efficient)
            const result = await optionService.findAll(ctx, {
                filter: { code: { eq: code } },
                take: 1,
            } as never);

            if (result.items.length > 0) {
                ids.push(result.items[0].id);
                continue;
            }

            // Fall back to case-insensitive name search
            const nameResult = await optionService.findAll(ctx, {
                filter: { name: { contains: code } },
                take: 50,
            } as never);

            const nameMatch = nameResult.items.find(
                (opt: ProductOption) => opt.name?.toLowerCase() === code.toLowerCase(),
            );

            if (nameMatch) {
                ids.push(nameMatch.id);
            } else {
                notFoundCodes.push(code);
            }
        } catch (error) {
            notFoundCodes.push(code);
            logger.warn(`Failed to resolve option code "${code}": ${getErrorMessage(error)}`);
        }
    }

    if (notFoundCodes.length > 0) {
        logger.warn(`Option codes not found: ${notFoundCodes.join(', ')}`);
    }

    return ids;
}

/**
 * Handle variant options with configurable mode.
 * Provides control over how product options are assigned to variants.
 *
 * Follows the same pattern as handleFacetValues() in shared-helpers.ts.
 *
 * @param ctx Request context
 * @param optionService ProductOptionService for resolving option codes
 * @param variantService ProductVariantService for variant updates
 * @param variantId ProductVariant ID
 * @param optionCodes Array of option codes from the record
 * @param mode How to handle options (REPLACE_ALL, MERGE, SKIP)
 * @param logger Logger for diagnostic messages
 */
export async function handleOptions(
    ctx: RequestContext,
    optionService: ProductOptionService,
    variantService: ProductVariantService,
    variantId: ID,
    optionCodes: string[],
    mode: OptionsMode = 'REPLACE_ALL',
    logger: DataHubLogger,
): Promise<void> {
    if (!optionCodes || optionCodes.length === 0) {
        logger.debug(`No option codes provided, skipping`);
        return;
    }

    // SKIP mode - do nothing
    if (mode === 'SKIP') {
        logger.debug(`Skipping option handling (mode: SKIP)`);
        return;
    }

    // Resolve option codes to IDs
    const newOptionIds = await resolveOptionIds(ctx, optionService, optionCodes, logger);

    if (newOptionIds.length === 0) {
        logger.warn(`No valid options found from codes: ${optionCodes.join(', ')}`);
        return;
    }

    // REPLACE_ALL mode - replace all options
    if (mode === 'REPLACE_ALL') {
        // Vendure API accepts optionIds on update but type definition omits it
        await variantService.update(ctx, [{ id: variantId, optionIds: newOptionIds } as any]);
        logger.debug(`Replaced all options with ${newOptionIds.length} options (mode: REPLACE_ALL)`);
        return;
    }

    // MERGE mode - add new options, keep existing
    if (mode === 'MERGE') {
        const variant = await variantService.findOne(ctx, variantId, ['options']);
        const existingIds = (variant?.options?.map((opt: ProductOption) => opt.id) ?? []) as ID[];
        const mergedIds = [...new Set([...existingIds, ...newOptionIds])];
        const addedCount = mergedIds.length - existingIds.length;

        // Vendure API accepts optionIds on update but type definition omits it
        await variantService.update(ctx, [{ id: variantId, optionIds: mergedIds } as any]);
        logger.debug(
            `Merged options: ${existingIds.length} existing + ${newOptionIds.length} new = ${mergedIds.length} total (${addedCount} added, mode: MERGE)`,
        );
        return;
    }
}
