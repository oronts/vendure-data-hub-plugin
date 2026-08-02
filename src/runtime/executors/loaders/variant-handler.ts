import { Injectable } from '@nestjs/common';
import {
    AssetService,
    ChannelService,
    ConfigService,
    ID,
    ProductOptionGroupService,
    ProductOptionService,
    ProductService,
    type ProductVariant,
    ProductVariantService,
    RequestContext,
    RequestContextService,
    StockLocationService,
    TaxCategoryService,
} from '@vendure/core';
import { PipelineStepDefinition } from '../../../types';
import { LoadStrategy } from '../../../constants/enums';
import {
    LoaderExecutionResult,
    OnRecordErrorCallback,
    RecordObject,
} from '../../executor-types';
import {
    LoaderHandler,
    LoaderSimulationResult,
} from './types';
import { assertCreateDuplicateCanBeSkipped } from './duplicate-handling';
import {
    createOptionGroupCache,
    OptionGroupCache,
    resolveStockLevels,
} from './shared-lookups';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { getObjectValue, getStringValue } from '../../../loaders/shared-helpers';
import { LOGGER_CONTEXTS } from '../../../constants/core';
import { applyEntityAssetInput } from './entity-asset-input';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import {
    assertDefaultCurrencyPrices,
    buildVariantTranslations,
    extractVariantPrices,
    filterVariantPricesForContext,
    getVariantName,
    parseVariantEnabled,
    parseVariantStockByLocation,
    parseVariantStockOnHand,
    resolveVariantHandlerSettings,
    VariantHandlerSettings,
} from './variant-handler-input';
import {
    findSourceVariantBySku,
    resolveAllVariantOptionIds,
    resolveVariantChannelPlan,
    resolveVariantProductId,
    resolveVariantTaxCategoryId,
    VariantChannelPlan,
} from './variant-handler-resolution';
import {
    assignVariantToChannel,
    createVariant,
    persistVariantContextPrice,
    updateVariant,
    VariantWriteValues,
} from './variant-handler-persistence';
import { simulateVariantRecords } from './variant-handler-simulation';

type RecordOutcome = 'ok' | 'fail' | 'skipped';

interface ExecutionCaches {
    optionGroups: OptionGroupCache;
}

interface VariantIdentity {
    sku: string;
    name: string;
}

type VariantRecordValues = Omit<VariantWriteValues, 'translations'>;

@Injectable()
export class VariantHandler implements LoaderHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private productService: ProductService,
        private productVariantService: ProductVariantService,
        private productOptionGroupService: ProductOptionGroupService,
        private productOptionService: ProductOptionService,
        private requestContextService: RequestContextService,
        private taxCategoryService: TaxCategoryService,
        private channelService: ChannelService,
        private stockLocationService: StockLocationService,
        private configService: ConfigService,
        private assetService: AssetService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PRODUCT_VARIANT_LOADER);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: unknown,
    ): Promise<LoaderExecutionResult> {
        const result = { ok: 0, fail: 0, skipped: 0 };
        const settings = resolveVariantHandlerSettings(step, this.configService);
        const caches: ExecutionCaches = {
            optionGroups: createOptionGroupCache(),
        };

        for (const record of input) {
            try {
                const outcome = await this.executeRecord(
                    ctx,
                    step,
                    record,
                    settings,
                    caches,
                    onRecordError,
                );
                result[outcome]++;
            } catch (error) {
                await this.reportRecordError(step, record, error, onRecordError);
                result.fail++;
            }
        }
        return result;
    }

    private async executeRecord(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        record: RecordObject,
        settings: VariantHandlerSettings,
        caches: ExecutionCaches,
        onRecordError?: OnRecordErrorCallback,
    ): Promise<RecordOutcome> {
        const identity = await this.resolveIdentity(step, record, settings, onRecordError);
        if (!identity) return 'fail';

        const { config } = settings;
        const channelPlan = await resolveVariantChannelPlan(
            this.requestContextService,
            this.channelService,
            ctx,
            config,
            record,
        );
        const lookup = await findSourceVariantBySku(
            this.productVariantService,
            channelPlan,
            identity.sku,
        );
        const existing = lookup.variant;
        const recordValues = await this.resolveRecordValues(channelPlan, record, settings);
        if (existing && settings.strategy === LoadStrategy.CREATE) {
            assertCreateDuplicateCanBeSkipped(config, 'variant', identity.sku);
            return 'skipped';
        }
        if (!existing && settings.strategy === LoadStrategy.UPDATE) {
            await onRecordError?.(
                step.key,
                `Variant not found for update: ${identity.sku}`,
                record,
            );
            return 'fail';
        }
        assertDefaultCurrencyPrices(
            recordValues.prices,
            existing ? channelPlan.targets : [channelPlan.source, ...channelPlan.targets],
        );

        const sourceValues = this.withTranslations(
            channelPlan.source,
            record,
            settings,
            identity.name,
            this.valuesForContext(recordValues, channelPlan.source),
        );
        const variantId = existing
            ? await this.updateExistingVariant(
                channelPlan.source,
                existing,
                record,
                sourceValues,
                settings,
                caches.optionGroups,
            )
            : await this.createNewVariant(
                channelPlan.source,
                record,
                identity,
                sourceValues,
                settings,
                caches.optionGroups,
            );
        await applyEntityAssetInput({
            ctx: channelPlan.source,
            record,
            config,
            entityId: variantId,
            assetService: this.assetService,
            entityService: this.productVariantService,
            logger: this.logger,
        });
        await this.syncTargetChannels(
            channelPlan,
            lookup.assignedTargetChannelIds,
            recordValues,
            variantId,
        );
        return 'ok';
    }

    private async resolveIdentity(
        step: PipelineStepDefinition,
        record: RecordObject,
        settings: VariantHandlerSettings,
        onRecordError?: OnRecordErrorCallback,
    ): Promise<VariantIdentity | undefined> {
        const sku = getStringValue(record, settings.skuKey);
        const name = getVariantName(record, settings.config, settings.nameKey);
        if (sku && name) return { sku, name };
        const missing = !sku ? 'sku' : 'name';
        await onRecordError?.(
            step.key,
            `Missing required field "${missing}" for variantUpsert`,
            record,
        );
        return undefined;
    }

    private async resolveRecordValues(
        channelPlan: VariantChannelPlan,
        record: RecordObject,
        settings: VariantHandlerSettings,
    ): Promise<VariantRecordValues> {
        const { config } = settings;
        const taxCategoryId = await resolveVariantTaxCategoryId(
            this.taxCategoryService,
            channelPlan.source,
            config.taxCategoryName,
        );
        const stockByLocation = parseVariantStockByLocation(
            record,
            config.stockByLocationField,
        );
        const stockLevels = await resolveStockLevels(
            this.stockLocationService,
            channelPlan.source,
            stockByLocation,
        );
        return {
            ...extractVariantPrices(
                record,
                settings.priceKey,
                config.priceByCurrencyField,
                settings.moneyPrecision,
                [channelPlan.source, ...channelPlan.targets],
            ),
            stockOnHand: parseVariantStockOnHand(record, settings.stockKey),
            stockLevels,
            taxCategoryId,
            customFields: getObjectValue(record, settings.customFieldsKey),
            enabled: parseVariantEnabled(record[settings.enabledKey]),
        };
    }

    private valuesForContext(
        values: VariantRecordValues,
        ctx: RequestContext,
    ): VariantRecordValues {
        return {
            ...values,
            prices: filterVariantPricesForContext(values.prices, ctx),
        };
    }

    private withTranslations(
        ctx: RequestContext,
        record: RecordObject,
        settings: VariantHandlerSettings,
        name: string,
        values: VariantRecordValues,
    ): VariantWriteValues {
        return {
            translations: buildVariantTranslations(ctx, record, settings.config, name),
            ...values,
        };
    }

    private async updateExistingVariant(
        ctx: RequestContext,
        existing: ProductVariant,
        record: RecordObject,
        values: VariantWriteValues,
        settings: VariantHandlerSettings,
        optionCache: OptionGroupCache,
    ): Promise<ID> {
        const optionIds = await resolveAllVariantOptionIds(
            this.optionServices,
            ctx,
            record,
            existing.productId,
            settings.config,
            optionCache,
        );
        await updateVariant(this.persistenceServices, ctx, existing, values, optionIds);
        return existing.id;
    }

    private async createNewVariant(
        ctx: RequestContext,
        record: RecordObject,
        identity: VariantIdentity,
        values: VariantWriteValues,
        settings: VariantHandlerSettings,
        optionCache: OptionGroupCache,
    ): Promise<ID> {
        const productId = await resolveVariantProductId(this.productService, ctx, record);
        if (!productId) {
            throw new Error(
                `Cannot create variant "${identity.sku}" without a parent product`,
            );
        }
        const optionIds = await resolveAllVariantOptionIds(
            this.optionServices,
            ctx,
            record,
            productId,
            settings.config,
            optionCache,
        );
        return createVariant(
            this.persistenceServices,
            ctx,
            productId,
            identity.sku,
            values,
            optionIds,
        );
    }

    private async syncTargetChannels(
        plan: VariantChannelPlan,
        assignedTargetChannelIds: ReadonlySet<string>,
        values: VariantRecordValues,
        variantId: ID,
    ): Promise<void> {
        for (const target of plan.targets) {
            if (!assignedTargetChannelIds.has(String(target.channelId))) {
                await assignVariantToChannel(
                    this.persistenceServices,
                    plan.source,
                    variantId,
                    target.channelId,
                );
            }
            await persistVariantContextPrice(
                this.productVariantService,
                target,
                variantId,
                this.valuesForContext(values, target),
            );
        }
    }

    private async reportRecordError(
        step: PipelineStepDefinition,
        record: RecordObject,
        error: unknown,
        onRecordError?: OnRecordErrorCallback,
    ): Promise<void> {
        await onRecordError?.(
            step.key,
            getErrorMessage(error) || 'variantUpsert failed',
            record,
            getErrorStack(error),
        );
    }

    async simulate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<LoaderSimulationResult> {
        const settings = resolveVariantHandlerSettings(step, this.configService);
        return simulateVariantRecords(this.simulationServices, ctx, input, settings);
    }

    private get persistenceServices() {
        return {
            productVariantService: this.productVariantService,
            logger: this.logger,
        };
    }

    private get optionServices() {
        return {
            productOptionGroupService: this.productOptionGroupService,
            productOptionService: this.productOptionService,
            productService: this.productService,
        };
    }

    private get simulationServices() {
        return {
            productService: this.productService,
            productVariantService: this.productVariantService,
            requestContextService: this.requestContextService,
            channelService: this.channelService,
            taxCategoryService: this.taxCategoryService,
        };
    }
}
