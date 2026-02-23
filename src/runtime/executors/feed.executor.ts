import { Injectable, Optional } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { JsonObject, PipelineStepDefinition, PipelineContext } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { RecordObject, OnRecordErrorCallback, FeedExecutionResult, SANDBOX_PIPELINE_ID } from '../executor-types';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { AdapterType } from '../../constants/enums';
import { BaseFeedConfig } from '../config-types';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { FeedAdapter, FeedContext } from '../../sdk/types';
import { createSecretsAdapter, createConnectionsAdapter, createLoggerAdapter, handleCustomAdapterError } from './context-adapters';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { FEED_HANDLER_REGISTRY } from './feeds/feed-handler-registry';
import { FeedFieldMappings } from './feeds/feed-handler.types';

@Injectable()
export class FeedExecutor {
    private readonly logger: DataHubLogger;

    constructor(
        private secretService: SecretService,
        private connectionService: ConnectionService,
        loggerFactory: DataHubLoggerFactory,
        @Optional() private registry?: DataHubRegistryService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FEED_EXECUTOR);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        pipelineContext?: PipelineContext,
    ): Promise<FeedExecutionResult> {
        const cfg = step.config as BaseFeedConfig;
        const adapterCode = cfg.adapterCode;
        const startTime = Date.now();
        let ok = 0;
        let fail = 0;
        let outputPath: string | undefined;

        this.logger.debug(`Executing feed step`, {
            stepKey: step.key,
            adapterCode,
            recordCount: input.length,
        });

        // Common field mappings
        const fields: FeedFieldMappings = {
            titleField: cfg.titleField ?? 'name',
            descriptionField: cfg.descriptionField ?? 'description',
            priceField: cfg.priceField ?? 'price',
            imageField: cfg.imageField ?? 'image',
            linkField: cfg.linkField ?? 'link',
            brandField: cfg.brandField ?? 'brand',
            gtinField: cfg.gtinField ?? 'gtin',
            availabilityField: cfg.availabilityField ?? 'availability',
            currency: cfg.currency ?? 'USD',
        };

        // Try built-in handlers first
        const entry = adapterCode ? FEED_HANDLER_REGISTRY.get(adapterCode) : undefined;
        if (entry) {
            const result = await entry.handler({
                stepKey: step.key,
                config: cfg,
                records: input,
                fields,
                onRecordError,
                logger: this.logger,
            });
            ok = result.ok;
            fail = result.fail;
            outputPath = result.outputPath;
        } else if (adapterCode && this.registry) {
            // Try custom feed generators from registry
            const customFeed = this.registry.getRuntime(AdapterType.FEED, adapterCode) as FeedAdapter<unknown> | undefined;
            if (customFeed && typeof customFeed.generateFeed === 'function') {
                const result = await this.executeCustomFeed(ctx, step, input, customFeed, pipelineContext);
                ok = result.ok;
                fail = result.fail;
                outputPath = result.outputPath;
            } else {
                this.logger.warn(`Unknown feed adapter`, { stepKey: step.key, adapterCode });
                ok = input.length;
            }
        } else {
            this.logger.warn(`Unknown feed adapter`, { stepKey: step.key, adapterCode });
            ok = input.length;
        }

        const durationMs = Date.now() - startTime;
        this.logger.info(`Feed generation complete`, {
            stepKey: step.key,
            adapterCode,
            ok,
            fail,
            outputPath,
            durationMs,
        });

        return { ok, fail, outputPath };
    }

    /**
     * Execute a custom feed adapter from the registry.
     *
     * SECURITY NOTE: Custom feed adapters that make outbound HTTP requests
     * are responsible for calling assertUrlSafe() (from url-security.utils)
     * before fetching any user-supplied URLs. The FeedContext does not proxy
     * HTTP calls, so SSRF protection must be applied within each adapter.
     */
    private async executeCustomFeed(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        feed: FeedAdapter<unknown>,
        pipelineContext?: PipelineContext,
    ): Promise<FeedExecutionResult> {
        const cfg = step.config as BaseFeedConfig;

        // Create feed context for the custom feed generator
        const feedContext: FeedContext = {
            ctx,
            pipelineId: SANDBOX_PIPELINE_ID,
            stepKey: step.key,
            pipelineContext: pipelineContext ?? {} as PipelineContext,
            secrets: createSecretsAdapter(this.secretService, ctx),
            connections: createConnectionsAdapter(this.connectionService, ctx),
            logger: createLoggerAdapter(this.logger),
            dryRun: false,
            channelId: cfg?.channelId,
            languageCode: cfg?.languageCode,
            currencyCode: cfg?.currency ?? cfg?.currencyCode,
        };

        try {
            const result = await feed.generateFeed(feedContext, cfg, input as readonly JsonObject[]);
            return {
                ok: result.validCount ?? result.itemCount ?? input.length,
                fail: result.invalidCount ?? result.validationErrors?.length ?? 0,
                outputPath: result.outputPath,
            };
        } catch (error) {
            return handleCustomAdapterError(error, this.logger, 'Custom feed generator', feed.code, step.key, input.length);
        }
    }
}
