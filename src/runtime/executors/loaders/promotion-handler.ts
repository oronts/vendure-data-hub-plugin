import { Injectable } from '@nestjs/common';
import {
    ChannelService,
    Promotion,
    PromotionService,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
    type ID,
} from '@vendure/core';
import { LOGGER_CONTEXTS } from '../../../constants/core';
import { LoadStrategy } from '../../../constants/enums';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import type { ErrorHandlingConfig, PipelineStepDefinition } from '../../../types';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import type {
    LoaderExecutionResult,
    OnRecordErrorCallback,
    RecordObject,
} from '../../executor-types';
import { createChannelCodeRequestContext } from '../../helpers/channel-request-context';
import {
    assertCreateDuplicateCanBeSkipped,
} from './duplicate-handling';
import {
    createUpsertSimulationDetail,
    summarizeSimulationDetails,
} from './loader-simulation';
import {
    buildCreatePromotionInput,
    buildUpdatePromotionInput,
    getPromotionCode,
    getPromotionConfig,
    getPromotionRecordValue,
    type PromotionHandlerConfig,
} from './promotion-handler-input';
import { parsePromotionOperations } from './promotion-operation-input';
import { resolveChannelIds } from './shared-lookups';
import type { LoaderHandler, LoaderSimulationResult } from './types';

type PromotionMutationResult = 'ok' | 'skipped';

function hasId(value: unknown): value is { id: ID } {
    return Boolean(
        value
        && typeof value === 'object'
        && ['string', 'number'].includes(typeof Reflect.get(value, 'id')),
    );
}

function promotionResultError(action: 'create' | 'update', value: unknown): Error {
    const message = value && typeof value === 'object'
        ? Reflect.get(value, 'message') ?? Reflect.get(value, 'errorCode')
        : undefined;
    return new Error(`Failed to ${action} promotion: ${String(message ?? 'Vendure returned no promotion ID')}`);
}

@Injectable()
export class PromotionHandler implements LoaderHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private readonly promotionService: PromotionService,
        private readonly requestContextService: RequestContextService,
        private readonly channelService: ChannelService,
        private readonly connection: TransactionalConnection,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PROMOTION_LOADER);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<LoaderExecutionResult> {
        let ok = 0;
        let fail = 0;
        let skipped = 0;
        const config = getPromotionConfig(step.config);
        const channelCache = new Map<string, ID>();

        for (const record of input) {
            try {
                const result = await this.connection.withTransaction(
                    ctx,
                    transactionCtx => this.upsertRecord(
                        transactionCtx,
                        record,
                        config,
                        channelCache,
                    ),
                );
                if (result === 'skipped') {
                    skipped++;
                } else {
                    ok++;
                }
            } catch (error) {
                await onRecordError?.(
                    step.key,
                    getErrorMessage(error) || 'promotionUpsert failed',
                    record,
                    getErrorStack(error),
                );
                fail++;
            }
        }
        return { ok, fail, skipped };
    }

    async simulate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<LoaderSimulationResult> {
        const config = getPromotionConfig(step.config);
        const operationCtx = await this.getOperationContext(ctx, config);
        const recordDetails = [];

        for (let index = 0; index < input.length; index++) {
            const record = input[index];
            const code = getPromotionCode(record, config);
            let validationError = code ? undefined : 'Missing required field: code';
            let existing: Promotion | undefined;
            if (!validationError) {
                try {
                    if (config.conditionsMode !== 'SKIP') {
                        parsePromotionOperations(
                            record,
                            config.conditionsField,
                            'conditions',
                        );
                    }
                    if (config.actionsMode !== 'SKIP') {
                        parsePromotionOperations(record, config.actionsField, 'actions');
                    }
                    existing = await this.findByCouponCode(operationCtx, code);
                    if (existing) {
                        buildUpdatePromotionInput(operationCtx, record, config, existing);
                    } else if (config.strategy !== LoadStrategy.UPDATE) {
                        buildCreatePromotionInput(operationCtx, record, config, code);
                    }
                } catch (error) {
                    validationError = getErrorMessage(error);
                }
            }
            recordDetails.push(createUpsertSimulationDetail({
                record,
                index,
                entityType: 'Promotion',
                existing,
                strategy: config.strategy,
                skipDuplicates: config.skipDuplicates,
                identifier: code || undefined,
                missingIdentifier: validationError,
            }));
        }

        return {
            supported: true,
            recordsIn: input.length,
            recordDetails,
            ...summarizeSimulationDetails(recordDetails),
        };
    }

    private async upsertRecord(
        ctx: RequestContext,
        record: RecordObject,
        config: PromotionHandlerConfig,
        channelCache: Map<string, ID>,
    ): Promise<PromotionMutationResult> {
        const operationCtx = await this.getOperationContext(ctx, config);
        const code = getPromotionCode(record, config);
        if (!code) {
            throw new Error('Missing required field: code');
        }

        const existing = await this.findByCouponCode(operationCtx, code);
        const strategy = config.strategy ?? LoadStrategy.UPSERT;
        let promotionId: ID;
        if (existing) {
            if (strategy === LoadStrategy.CREATE) {
                assertCreateDuplicateCanBeSkipped(config, 'promotion', code);
                return 'skipped';
            }
            const result = await this.promotionService.updatePromotion(
                operationCtx,
                buildUpdatePromotionInput(operationCtx, record, config, existing),
            );
            if (!hasId(result)) {
                throw promotionResultError('update', result);
            }
            promotionId = result.id;
        } else {
            if (strategy === LoadStrategy.UPDATE) {
                throw new Error(`Promotion not found for update: ${code}`);
            }
            const result = await this.promotionService.createPromotion(
                operationCtx,
                buildCreatePromotionInput(operationCtx, record, config, code),
            );
            if (!hasId(result)) {
                throw promotionResultError('create', result);
            }
            promotionId = result.id;
        }

        await this.assignRecordChannels(
            operationCtx,
            record,
            config,
            promotionId,
            channelCache,
        );
        return 'ok';
    }

    private async getOperationContext(
        ctx: RequestContext,
        config: PromotionHandlerConfig,
    ): Promise<RequestContext> {
        return config.channel
            ? createChannelCodeRequestContext(
                this.requestContextService,
                this.channelService,
                ctx,
                config.channel,
            )
            : ctx;
    }

    private async findByCouponCode(
        ctx: RequestContext,
        couponCode: string,
    ): Promise<Promotion | undefined> {
        const result = await this.promotionService.findAll(ctx, {
            filter: { couponCode: { eq: couponCode } },
            take: 2,
        });
        if (result.items.length > 1) {
            throw new Error(`Multiple promotions use coupon code "${couponCode}" in channel ${ctx.channel.code}`);
        }
        return result.items[0];
    }

    private async assignRecordChannels(
        ctx: RequestContext,
        record: RecordObject,
        config: PromotionHandlerConfig,
        promotionId: ID,
        channelCache: Map<string, ID>,
    ): Promise<void> {
        if (!config.channelsField) {
            return;
        }
        const value = getPromotionRecordValue(record, config.channelsField);
        if (value === undefined || value === null) {
            return;
        }
        const channelIds = await resolveChannelIds(
            this.channelService,
            ctx,
            value,
            channelCache,
            this.logger,
        );
        if (channelIds.length > 0) {
            await this.channelService.assignToChannels(
                ctx,
                Promotion,
                promotionId,
                channelIds,
            );
        }
    }
}
