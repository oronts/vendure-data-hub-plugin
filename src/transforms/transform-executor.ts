/**
 * Transform Executor
 *
 * Executes transform chains on field values.
 * Supports all transform types defined in pipeline-definition.ts
 * with extensibility for custom transforms.
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { Transform, JsonValue, JsonObject } from '../types/index';
import { LOGGER_CONTEXTS } from '../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../services/logger';
import { getErrorMessage } from '../utils/error.utils';

import { CustomTransformFn, CustomTransformInfo } from './types';
import { performLookup } from './record/lookup-transforms';
import { TRANSFORM_REGISTRY, isBuiltInTransform } from './transform-registry';
import { BUILTIN_CUSTOM_TRANSFORMS } from './custom-transforms';

@Injectable()
export class TransformExecutor implements OnModuleInit {
    private readonly logger: DataHubLogger;
    private customTransforms = new Map<string, CustomTransformFn>();
    private transformRegistry = new Map<string, CustomTransformInfo>();

    constructor(
        private connection: TransactionalConnection,
        private moduleRef: ModuleRef,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.TRANSFORM_EXECUTOR);
    }

    async onModuleInit() {
        // Register built-in custom transforms
        for (const transform of BUILTIN_CUSTOM_TRANSFORMS) {
            this.registerCustomTransform(transform);
        }

        this.logger.info(`Transform executor initialized`, { recordCount: this.customTransforms.size });
    }

    /**
     * Register a custom transform
     * Can be called by plugins to add new transform types
     */
    registerCustomTransform(info: CustomTransformInfo): void {
        this.customTransforms.set(info.type, info.transform);
        this.transformRegistry.set(info.type, info);
        this.logger.debug(`Registered custom transform: ${info.type}`);
    }

    /**
     * Get all registered transforms (built-in + custom)
     */
    getRegisteredTransforms(): CustomTransformInfo[] {
        return Array.from(this.transformRegistry.values());
    }

    /**
     * Check if a transform type is available
     */
    hasTransform(type: string): boolean {
        return this.customTransforms.has(type) || isBuiltInTransform(type);
    }

    /**
     * Execute a chain of transforms on a value
     */
    async execute(
        ctx: RequestContext,
        value: JsonValue,
        transforms: Transform[],
        record?: JsonObject,
    ): Promise<JsonValue> {
        let result = value;

        for (const transform of transforms) {
            try {
                result = await this.applyTransform(ctx, result, transform, record);
            } catch (error) {
                this.logger.warn(
                    `Transform ${transform.type} failed: ${getErrorMessage(error)}`,
                );
                // Continue with current value on error
            }
        }

        return result;
    }

    /**
     * Apply a single transform
     */
    private async applyTransform(
        ctx: RequestContext,
        value: JsonValue,
        transform: Transform,
        record?: JsonObject,
    ): Promise<JsonValue> {
        const config = transform.config ?? {};

        // LOOKUP requires async context (RequestContext + TransactionalConnection)
        if (transform.type === 'LOOKUP') {
            return await performLookup(ctx, value, config, this.connection);
        }

        // Check the built-in transform registry
        const builtInFn = TRANSFORM_REGISTRY.get(transform.type);
        if (builtInFn) {
            return builtInFn(value, config, record);
        }

        // Fall back to custom transforms
        const customTransform = this.customTransforms.get(transform.type);
        if (customTransform) {
            return await customTransform(ctx, value, config, record);
        }

        this.logger.warn(`Unknown transform type: ${transform.type}`);
        return value;
    }
}
