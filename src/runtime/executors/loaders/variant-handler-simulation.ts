import type {
    ChannelService,
    ProductService,
    ProductVariant,
    ProductVariantService,
    RequestContext,
    RequestContextService,
    TaxCategoryService,
} from '@vendure/core';
import { LoadStrategy } from '../../../constants/enums';
import type { RecordObject } from '../../executor-types';
import { getErrorMessage } from '../../../utils/error.utils';
import { getStringValue } from '../../../loaders/shared-helpers';
import {
    createUpsertSimulationDetail,
    summarizeSimulationDetails,
} from './loader-simulation';
import type {
    LoaderSimulationRecordDetail,
    LoaderSimulationResult,
} from './types';
import {
    assertDefaultCurrencyPrices,
    extractVariantPrices,
    getVariantName,
    parseVariantEnabled,
    parseVariantStockByLocation,
    parseVariantStockOnHand,
    VariantHandlerSettings,
} from './variant-handler-input';
import {
    findSourceVariantBySku,
    resolveVariantChannelPlan,
    resolveVariantProductId,
    resolveVariantTaxCategoryId,
} from './variant-handler-resolution';

interface VariantSimulationServices {
    productService: ProductService;
    productVariantService: ProductVariantService;
    requestContextService: RequestContextService;
    channelService: ChannelService;
    taxCategoryService: TaxCategoryService;
}

export async function simulateVariantRecords(
    services: VariantSimulationServices,
    ctx: RequestContext,
    input: RecordObject[],
    settings: VariantHandlerSettings,
): Promise<LoaderSimulationResult> {
    const recordDetails: LoaderSimulationRecordDetail[] = [];
    for (let index = 0; index < input.length; index++) {
        recordDetails.push(await simulateVariantRecord(
            services,
            ctx,
            input[index],
            index,
            settings,
        ));
    }
    return {
        supported: true,
        recordsIn: input.length,
        recordDetails,
        ...summarizeSimulationDetails(recordDetails),
    };
}

async function simulateVariantRecord(
    services: VariantSimulationServices,
    ctx: RequestContext,
    record: RecordObject,
    index: number,
    settings: VariantHandlerSettings,
): Promise<LoaderSimulationRecordDetail> {
    const sku = getStringValue(record, settings.skuKey);
    const name = getVariantName(record, settings.config, settings.nameKey);
    if (!sku || !name) {
        return createSimulationError(
            record,
            index,
            sku,
            !sku
                ? 'Missing required field "sku" for variantUpsert'
                : 'Missing required field "name" for variantUpsert',
        );
    }

    try {
        const channelPlan = await resolveVariantChannelPlan(
            services.requestContextService,
            services.channelService,
            ctx,
            settings.config,
            record,
        );
        const lookup = await findSourceVariantBySku(
            services.productVariantService,
            channelPlan,
            sku,
        );
        parseVariantEnabled(record[settings.enabledKey]);
        parseVariantStockOnHand(record, settings.stockKey);
        parseVariantStockByLocation(record, settings.config.stockByLocationField);
        await resolveVariantTaxCategoryId(
            services.taxCategoryService,
            channelPlan.source,
            settings.config.taxCategoryName,
        );
        const prices = extractVariantPrices(
            record,
            settings.priceKey,
            settings.config.priceByCurrencyField,
            settings.moneyPrecision,
            [channelPlan.source, ...channelPlan.targets],
        );
        if (!strategyStopsBeforePriceCheck(lookup.variant, settings)) {
            assertDefaultCurrencyPrices(
                prices.prices,
                lookup.variant
                    ? channelPlan.targets
                    : [channelPlan.source, ...channelPlan.targets],
            );
        }
        const validationError = await resolveSimulationError(
            services.productService,
            channelPlan.source,
            record,
            sku,
            lookup.variant,
            settings,
        );
        return createUpsertSimulationDetail({
            record,
            index,
            entityType: 'ProductVariant',
            existing: lookup.variant,
            strategy: settings.config.strategy,
            skipDuplicates: settings.config.skipDuplicates,
            identifier: sku,
            missingIdentifier: validationError,
        });
    } catch (error) {
        return createSimulationError(record, index, sku, getErrorMessage(error));
    }
}

function strategyStopsBeforePriceCheck(
    existing: ProductVariant | undefined,
    settings: VariantHandlerSettings,
): boolean {
    return Boolean(existing && settings.strategy === LoadStrategy.CREATE)
        || (!existing && settings.strategy === LoadStrategy.UPDATE);
}

async function resolveSimulationError(
    productService: ProductService,
    ctx: RequestContext,
    record: RecordObject,
    sku: string,
    existing: ProductVariant | undefined,
    settings: VariantHandlerSettings,
): Promise<string | undefined> {
    if (existing || settings.strategy === LoadStrategy.UPDATE) return undefined;
    const productId = await resolveVariantProductId(productService, ctx, record);
    return productId
        ? undefined
        : `Cannot create variant "${sku}" without a parent product`;
}

function createSimulationError(
    record: RecordObject,
    index: number,
    sku: string | undefined,
    message: string,
): LoaderSimulationRecordDetail {
    return createUpsertSimulationDetail({
        record,
        index,
        entityType: 'ProductVariant',
        existing: undefined,
        identifier: sku,
        missingIdentifier: message,
    });
}
