/**
 * DataHub Plugin Initialization
 *
 * Services that initialize the DataHub plugin on application startup.
 */

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DATAHUB_PLUGIN_OPTIONS, BUILTIN_ADAPTERS, LOGGER_CONTEXTS } from '../constants/index';
import { DataHubPluginOptions } from '../types/index';
import { DataHubRegistryService } from '../sdk/registry.service';
import { FeedGeneratorService } from '../feeds/feed-generator.service';
import { DataHubLogger, DataHubLoggerFactory } from '../services/logger';
import { getBuiltinOperatorRuntimes } from '../operators/operator-runtime-registry';

/**
 * AdapterBootstrapService registers built-in adapters on module initialization.
 * This ensures all default adapters are available when the plugin starts.
 */
@Injectable()
export class AdapterBootstrapService implements OnModuleInit {
    private readonly logger: DataHubLogger;

    constructor(
        @Inject(DATAHUB_PLUGIN_OPTIONS) private options: DataHubPluginOptions,
        private registry: DataHubRegistryService,
        private feedGeneratorService: FeedGeneratorService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.BOOTSTRAP);
    }

    onModuleInit(): void {
        const startTime = Date.now();
        let builtinAdaptersRegistered = 0;
        let builtinOperatorRuntimesRegistered = 0;
        let customAdaptersRegistered = 0;
        let feedGeneratorsRegistered = 0;

        // Register built-in adapter definitions (metadata for UI)
        if (this.options.registerBuiltinAdapters !== false) {
            this.logger.debug('Registering built-in adapter definitions', {
                adapterCount: BUILTIN_ADAPTERS.length,
            });
            for (const adapter of BUILTIN_ADAPTERS) {
                try {
                    this.registry.register(adapter);
                    builtinAdaptersRegistered++;
                } catch (err) {
                    // Ignore duplicates between reloads
                    this.logger.debug('Skipped adapter registration (likely duplicate)', {
                        adapterCode: adapter.code,
                    });
                }
            }
        }

        // Register built-in operator runtime adapters (with execution methods)
        // This bridges operator definitions with their runtime implementations
        if (this.options.registerBuiltinAdapters !== false) {
            const operatorRuntimes = getBuiltinOperatorRuntimes();
            this.logger.debug('Registering built-in operator runtimes', {
                operatorCount: operatorRuntimes.length,
            });
            for (const operatorRuntime of operatorRuntimes) {
                try {
                    this.registry.registerRuntime(operatorRuntime);
                    builtinOperatorRuntimesRegistered++;
                } catch (err) {
                    // Ignore duplicates between reloads
                    this.logger.debug('Skipped operator runtime registration (likely duplicate)', {
                        operatorCode: operatorRuntime.code,
                    });
                }
            }
        }

        // Register custom adapters from plugin options
        if (this.options.adapters?.length) {
            this.logger.debug('Registering custom adapters', {
                adapterCount: this.options.adapters.length,
            });
            for (const adapter of this.options.adapters) {
                try {
                    this.registry.registerRuntime(adapter as any);
                    customAdaptersRegistered++;
                } catch (err) {
                    this.logger.warn('Failed to register custom adapter', {
                        adapterCode: (adapter as any)?.code,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            }
        }

        // Register custom feed generators from plugin options
        if (this.options.feedGenerators?.length) {
            this.logger.debug('Registering custom feed generators', {
                generatorCount: this.options.feedGenerators.length,
            });
            for (const generator of this.options.feedGenerators) {
                try {
                    this.feedGeneratorService.registerCustomGenerator(generator);
                    feedGeneratorsRegistered++;
                } catch (err) {
                    this.logger.warn('Failed to register feed generator', {
                        generatorCode: generator.code,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            }
        }

        const durationMs = Date.now() - startTime;
        this.logger.info('DataHub plugin bootstrap completed', {
            builtinAdaptersRegistered,
            builtinOperatorRuntimesRegistered,
            customAdaptersRegistered,
            feedGeneratorsRegistered,
            durationMs,
        });
    }
}
