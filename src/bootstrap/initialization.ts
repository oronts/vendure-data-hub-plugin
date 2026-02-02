/**
 * DataHub Plugin Initialization
 *
 * Services that initialize the DataHub plugin on application startup.
 */

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DATAHUB_PLUGIN_OPTIONS, BUILTIN_ADAPTERS, LOGGER_CONTEXTS } from '../constants/index';
import { DataHubPluginOptions } from '../types/index';
import { DataHubRegistryService } from '../sdk/registry.service';
import { DataHubAdapter } from '../sdk/types/adapter-types';
import { FeedGeneratorService } from '../feeds/feed-generator.service';
import { DataHubLogger, DataHubLoggerFactory, getErrorMessage } from '../services/logger';
import { getBuiltinOperatorRuntimes } from '../operators/operator-runtime-registry';
import { configureScriptOperators } from '../operators/script';

function isDataHubAdapter(value: unknown): value is DataHubAdapter {
    if (value == null || typeof value !== 'object') {
        return false;
    }
    const obj = value as Record<string, unknown>;
    return typeof obj.type === 'string' && typeof obj.code === 'string';
}

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

    async onModuleInit(): Promise<void> {
        const startTime = Date.now();
        let builtinAdaptersRegistered = 0;
        let builtinOperatorRuntimesRegistered = 0;
        let customAdaptersRegistered = 0;
        let feedGeneratorsRegistered = 0;

        try {
            // Configure script operator security settings
            this.configureScriptSecurity();

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

            if (this.options.adapters?.length) {
                this.logger.debug('Registering custom adapters', {
                    adapterCount: this.options.adapters.length,
                });
                for (const adapter of this.options.adapters) {
                    try {
                        if (!isDataHubAdapter(adapter)) {
                            this.logger.warn('Invalid adapter structure - missing type or code');
                            continue;
                        }
                        this.registry.registerRuntime(adapter);
                        customAdaptersRegistered++;
                    } catch (err) {
                        const adapterCode = isDataHubAdapter(adapter) ? adapter.code : 'unknown';
                        this.logger.warn('Failed to register custom adapter', {
                            adapterCode,
                            error: getErrorMessage(err),
                        });
                    }
                }
            }

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
                            error: getErrorMessage(err),
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
        } catch (err) {
            const durationMs = Date.now() - startTime;
            this.logger.error('DataHub plugin bootstrap failed', err instanceof Error ? err : undefined, {
                builtinAdaptersRegistered,
                builtinOperatorRuntimesRegistered,
                customAdaptersRegistered,
                feedGeneratorsRegistered,
                durationMs,
            });
            // Re-throw to let NestJS handle the initialization failure
            throw err;
        }
    }

    /**
     * Configure script operator security based on plugin options
     */
    private configureScriptSecurity(): void {
        const scriptConfig = this.options.security?.script;

        if (!scriptConfig) {
            // Use defaults - script operators enabled
            this.logger.debug('Script operators using default security settings');
            return;
        }

        const isEnabled = scriptConfig.enabled !== false;

        this.logger.info('Configuring script operator security', {
            enabled: isEnabled,
            maxCacheSize: scriptConfig.maxCacheSize,
            defaultTimeoutMs: scriptConfig.defaultTimeoutMs,
            enableCache: scriptConfig.enableCache,
        });

        configureScriptOperators({
            enabled: isEnabled,
            security: scriptConfig.validation,
            evaluator: {
                maxCacheSize: scriptConfig.maxCacheSize,
                defaultTimeoutMs: scriptConfig.defaultTimeoutMs,
                enableCache: scriptConfig.enableCache,
            },
        });

        if (!isEnabled) {
            this.logger.warn('Script operators are DISABLED - user-provided code will not execute');
        }
    }
}
