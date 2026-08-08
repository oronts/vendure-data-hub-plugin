import {
    ChannelService,
    ForbiddenError,
    ID,
    Permission,
    ProductVariant,
    ProductVariantService,
    ProductOptionGroupService,
    ProductOptionService,
    ProductService,
    RequestContext,
    RequestContextService,
    TaxCategoryService,
} from '@vendure/core';
import { RecordObject } from '../../executor-types';
import { getRecordValue, getStringValue } from '../../../loaders/shared-helpers';
import {
    createChannelCodeRequestContext,
    createChannelRequestContext,
} from '../../helpers/channel-request-context';
import {
    OptionGroupCache,
    resolveOptionCodes,
    resolveOptionGroups,
    findVariantBySku,
} from './shared-lookups';
import { parseChannelCodes, VariantHandlerConfig } from './variant-handler-input';

export interface VariantOptionServices {
    productOptionGroupService: ProductOptionGroupService;
    productOptionService: ProductOptionService;
    productService: ProductService;
}

export interface VariantChannelPlan {
    source: RequestContext;
    targets: RequestContext[];
}

export interface VariantLookup {
    variant: ProductVariant | undefined;
    assignedTargetChannelIds: ReadonlySet<string>;
}

export async function resolveVariantChannelPlan(
    requestContextService: RequestContextService,
    channelService: ChannelService,
    ctx: RequestContext,
    config: VariantHandlerConfig,
    record: RecordObject,
): Promise<VariantChannelPlan> {
    const defaultChannel = await channelService.getDefaultChannel(ctx);
    const source = String(defaultChannel.id) === String(ctx.channelId)
        ? ctx
        : await createChannelRequestContext(requestContextService, ctx, defaultChannel);
    if (ctx.activeUserId != null && !source.userHasPermissions([Permission.UpdateCatalog])) {
        throw new ForbiddenError();
    }
    const channelCodes = collectTargetChannelCodes(config, record);
    const targets: RequestContext[] = [];
    const seenIds = new Set([String(source.channelId)]);
    for (const channelCode of channelCodes) {
        const target = await createChannelCodeRequestContext(
            requestContextService,
            channelService,
            ctx,
            channelCode,
        );
        if (!target.userHasPermissions([Permission.UpdateCatalog])) {
            throw new ForbiddenError();
        }
        if (!seenIds.has(String(target.channelId))) {
            targets.push(target);
            seenIds.add(String(target.channelId));
        }
    }
    return { source, targets };
}

function collectTargetChannelCodes(
    config: VariantHandlerConfig,
    record: RecordObject,
): string[] {
    const codes = config.channel ? [config.channel] : [];
    if (config.channelsField) {
        codes.push(...parseChannelCodes(record[config.channelsField]));
    }
    return [...new Set(codes)];
}

export async function findSourceVariantBySku(
    productVariantService: ProductVariantService,
    plan: VariantChannelPlan,
    sku: string,
): Promise<VariantLookup> {
    const sourceVariant = await findVariantBySku(productVariantService, plan.source, sku);
    const matches = new Map<string, { variant: ProductVariant; channelCode: string }>();
    const assignedTargetChannelIds = new Set<string>();
    if (sourceVariant) {
        matches.set(String(sourceVariant.id), {
            variant: sourceVariant,
            channelCode: plan.source.channel.code,
        });
    }
    for (const target of plan.targets) {
        const targetVariant = await findVariantBySku(productVariantService, target, sku);
        if (targetVariant) {
            if (
                sourceVariant
                && String(targetVariant.id) === String(sourceVariant.id)
            ) {
                assignedTargetChannelIds.add(String(target.channelId));
            }
            matches.set(String(targetVariant.id), {
                variant: targetVariant,
                channelCode: target.channel.code,
            });
        }
    }
    if (matches.size > 1) {
        throw new Error(`Multiple product variants use SKU "${sku}" in the selected channels`);
    }
    if (!sourceVariant && matches.size === 1) {
        const match = [...matches.values()][0];
        throw new Error(
            `Variant "${sku}" exists in channel "${match.channelCode}" but is not assigned to source channel "${plan.source.channel.code}"`,
        );
    }
    return {
        variant: sourceVariant,
        assignedTargetChannelIds,
    };
}

export async function resolveVariantProductId(
    productService: ProductService,
    ctx: RequestContext,
    record: RecordObject,
): Promise<ID | undefined> {
    const slug = getStringValue(record, 'productSlug');
    if (slug) {
        const product = await productService.findOneBySlug(ctx, slug);
        if (product) return product.id;
    }

    const directId = record['productId'];
    if (directId != null) {
        const product = await productService.findOne(ctx, directId as ID);
        if (product) return product.id;
    }

    const productName = getStringValue(record, 'productName');
    if (!productName) return undefined;
    const result = await productService.findAll(ctx, {
        filter: { name: { eq: productName } },
        take: 2,
    });
    if (result.totalItems > 1) {
        throw new Error(`Multiple products use name "${productName}"`);
    }
    return result.totalItems > 0 ? result.items[0].id : undefined;
}

export async function resolveVariantTaxCategoryId(
    taxCategoryService: TaxCategoryService,
    ctx: RequestContext,
    name: string | undefined,
): Promise<ID | undefined> {
    if (!name) return undefined;
    const result = await taxCategoryService.findAll(ctx, {
        filter: { name: { eq: name } },
        take: 2,
    });
    if (result.totalItems > 1) {
        throw new Error(`Multiple tax categories use name "${name}"`);
    }
    const id = result.items[0]?.id;
    if (id == null) {
        throw new Error(`Tax category "${name}" was not found`);
    }
    return id;
}

export async function resolveAllVariantOptionIds(
    services: VariantOptionServices,
    ctx: RequestContext,
    record: RecordObject,
    productId: ID,
    config: VariantHandlerConfig,
    optionCache: OptionGroupCache,
): Promise<ID[] | undefined> {
    const collected: ID[] = [];
    await collectCreatedOptionIds(services, ctx, record, productId, config, optionCache, collected);
    await collectResolvedOptionIds(services, ctx, record, productId, config, optionCache, collected);
    collectDirectOptionIds(record, config, collected);
    return collected.length > 0 ? collected : undefined;
}

async function collectCreatedOptionIds(
    services: VariantOptionServices,
    ctx: RequestContext,
    record: RecordObject,
    productId: ID,
    config: VariantHandlerConfig,
    optionCache: OptionGroupCache,
    collected: ID[],
): Promise<void> {
    if (!config.optionGroupsField) return;
    const rawOptions = getRecordValue(record, config.optionGroupsField);
    if (rawOptions == null) return;
    if (typeof rawOptions !== 'object' || Array.isArray(rawOptions)) {
        throw new Error(`Variant field "${config.optionGroupsField}" must be an option-group object`);
    }
    const optionsMap = Object.fromEntries(
        Object.entries(rawOptions).map(([key, value]) => {
            if (key.trim() === '' || typeof value !== 'string' || value.trim() === '') {
                throw new Error('Variant option groups must map non-empty group names to non-empty string values');
            }
            return [key.trim(), value.trim()];
        }),
    );
    if (Object.keys(optionsMap).length === 0) return;
    collected.push(...await resolveOptionGroups(
        services.productOptionGroupService,
        services.productOptionService,
        services.productService,
        ctx,
        productId,
        optionsMap,
        optionCache,
    ));
}

async function collectResolvedOptionIds(
    services: VariantOptionServices,
    ctx: RequestContext,
    record: RecordObject,
    productId: ID,
    config: VariantHandlerConfig,
    optionCache: OptionGroupCache,
    collected: ID[],
): Promise<void> {
    if (!config.optionCodesField) return;
    const codes = getRecordValue(record, config.optionCodesField);
    if (codes == null) return;
    if (!Array.isArray(codes)) {
        throw new Error(`Variant field "${config.optionCodesField}" must be an array of option codes`);
    }
    if (codes.length === 0) return;
    const parsedCodes = codes.map((code, index) => {
        if (typeof code !== 'string' || code.trim() === '') {
            throw new Error(
                `Variant option code at index ${index} must be a non-empty string`,
            );
        }
        return code;
    });
    collected.push(...await resolveOptionCodes(
        services.productOptionGroupService,
        ctx,
        productId,
        parsedCodes,
        optionCache,
    ));
}

function collectDirectOptionIds(
    record: RecordObject,
    config: VariantHandlerConfig,
    collected: ID[],
): void {
    if (!config.optionIdsField) return;
    const directIds = getRecordValue(record, config.optionIdsField);
    if (directIds == null) return;
    if (!Array.isArray(directIds)) {
        throw new Error(`Variant field "${config.optionIdsField}" must be an array of option IDs`);
    }
    if (directIds.length > 0) {
        collected.push(...directIds.map((id, index) => {
            if (
                (typeof id !== 'string' || id.trim() === '')
                && (typeof id !== 'number' || !Number.isFinite(id))
            ) {
                throw new Error(
                    `Variant option ID at index ${index} must be a non-empty string or finite number`,
                );
            }
            return id as ID;
        }));
    }
}
