import {
    ID,
    ProductOption,
    ProductOptionGroupService,
    ProductVariant,
    ProductVariantService,
    RequestContext,
    TaxCategoryService,
    TransactionalConnection,
} from '@vendure/core';
import { DataHubLogger } from '../../services/logger/datahub-logger';
import { OptionsMode } from '../../types/index';
import type { LookupStrategy } from '../base';
import { resolveEntityReferenceId } from '../entity-reference.helpers';

export { isRecoverableError, shouldUpdateField } from '../shared-helpers';

export interface VariantTaxCategoryReference {
    readonly taxCategoryId?: ID;
    readonly taxCategoryCode?: string;
}

export async function resolveVariantTaxCategoryId(
    ctx: RequestContext,
    taxCategoryService: TaxCategoryService,
    reference: VariantTaxCategoryReference,
): Promise<ID | undefined> {
    if (
        reference.taxCategoryId !== undefined
        || reference.taxCategoryCode !== undefined
    ) {
        const id = await resolveEntityReferenceId(
            ctx,
            taxCategoryService,
            'Tax category',
            {
                id: reference.taxCategoryId,
                code: reference.taxCategoryCode,
            },
        );
        if (id === null && reference.taxCategoryCode !== undefined) {
            throw new Error(`Tax category code "${reference.taxCategoryCode}" was not found`);
        }
        return id ?? undefined;
    }

    return undefined;
}

export function createVariantExternalIdLookupStrategy(
    connection: TransactionalConnection,
): LookupStrategy<TransactionalConnection, ProductVariant> {
    const fieldName = 'customFields.externalId';
    return {
        fieldName,
        lookup: async (ctx, _connection, value) => {
            if (value === undefined || value === null) return null;
            const repository = connection.getRepository(ctx, ProductVariant);
            const column = repository.metadata.findColumnWithPropertyPath(fieldName);
            if (!column) {
                throw new Error('ProductVariant custom field "externalId" is not configured');
            }

            const alias = 'lookupVariant';
            const query = repository.createQueryBuilder(alias);
            const entity = await query
                .innerJoin(
                    `${alias}.channels`,
                    'lookupChannel',
                    'lookupChannel.id = :channelId',
                    { channelId: ctx.channelId },
                )
                .where(
                    `${query.escape(alias)}.${query.escape(column.databaseName)} = :externalId`,
                    { externalId: value },
                )
                .getOne();
            return entity ? { id: entity.id, entity } : null;
        },
    };
}

export async function resolveOptionIds(
    ctx: RequestContext,
    optionGroupService: ProductOptionGroupService,
    productId: ID,
    optionCodes: string[],
): Promise<ID[]> {
    if (optionCodes.length === 0) return [];

    const groups = await optionGroupService.getOptionGroupsByProductId(ctx, productId);
    const optionsByCode = new Map<string, ProductOption[]>();
    for (const option of groups.flatMap(group => group.options)) {
        const matches = optionsByCode.get(option.code) ?? [];
        matches.push(option);
        optionsByCode.set(option.code, matches);
    }
    const ids: ID[] = [];
    const notFoundCodes: string[] = [];
    const ambiguousCodes: string[] = [];

    for (const code of optionCodes) {
        if (!code) continue;
        const matches = optionsByCode.get(code) ?? [];
        if (matches.length === 0) {
            notFoundCodes.push(code);
            continue;
        }
        if (matches.length > 1) {
            ambiguousCodes.push(code);
            continue;
        }
        ids.push(matches[0].id);
    }

    if (notFoundCodes.length > 0) {
        throw new Error(`Option codes not found: ${notFoundCodes.join(', ')}`);
    }
    if (ambiguousCodes.length > 0) {
        throw new Error(`Option codes are ambiguous for product ${String(productId)}: ${ambiguousCodes.join(', ')}`);
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
 * @param optionGroupService ProductOptionGroupService for resolving product-scoped option codes
 * @param variantService ProductVariantService for variant updates
 * @param variantId ProductVariant ID
 * @param optionCodes Array of option codes from the record
 * @param mode How to handle options (REPLACE_ALL, MERGE, SKIP)
 * @param logger Logger for diagnostic messages
 */
export async function handleOptions(
    ctx: RequestContext,
    optionGroupService: ProductOptionGroupService,
    variantService: ProductVariantService,
    variantId: ID,
    optionCodes: string[],
    mode: OptionsMode = 'REPLACE_ALL',
    logger: DataHubLogger,
): Promise<void> {
    if (!optionCodes || (optionCodes.length === 0 && mode !== 'REPLACE_ALL')) {
        logger.debug(`No option codes provided, skipping`);
        return;
    }

    // SKIP mode - do nothing
    if (mode === 'SKIP') {
        logger.debug(`Skipping option handling (mode: SKIP)`);
        return;
    }

    const variant = await variantService.findOne(ctx, variantId, ['options', 'product']);
    if (!variant) {
        throw new Error(`Product variant ${String(variantId)} was not found in the active channel`);
    }
    const newOptionIds = await resolveOptionIds(
        ctx,
        optionGroupService,
        variant.productId,
        optionCodes,
    );

    // REPLACE_ALL mode - replace all options
    if (mode === 'REPLACE_ALL') {
        await variantService.update(ctx, [{ id: variantId, optionIds: newOptionIds }]);
        logger.debug(`Replaced all options with ${newOptionIds.length} options (mode: REPLACE_ALL)`);
        return;
    }

    // MERGE mode - add new options, keep existing
    if (mode === 'MERGE') {
        const existingIds = (variant.options?.map((opt: ProductOption) => opt.id) ?? []) as ID[];
        const mergedIds = [...new Set([...existingIds, ...newOptionIds])];
        const addedCount = mergedIds.length - existingIds.length;

        await variantService.update(ctx, [{ id: variantId, optionIds: mergedIds }]);
        logger.debug(
            `Merged options: ${existingIds.length} existing + ${newOptionIds.length} new = ${mergedIds.length} total (${addedCount} added, mode: MERGE)`,
        );
        return;
    }
}
