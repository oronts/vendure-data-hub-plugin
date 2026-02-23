/**
 * DataHub Plugin Initialization
 *
 * Services that initialize the DataHub plugin on application startup.
 */

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DATAHUB_PLUGIN_OPTIONS, BUILTIN_ADAPTERS, LOGGER_CONTEXTS } from '../constants/index';
import { DataHubPluginOptions } from '../types/index';
import { DataHubRegistryService } from '../sdk/registry.service';
import { DataHubAdapter, AdapterDefinition } from '../sdk/types/adapter-types';
import { FeedGeneratorService } from '../feeds/feed-generator.service';
import { DataHubLogger, DataHubLoggerFactory } from '../services/logger';
import { getErrorMessage, toErrorOrUndefined } from '../utils/error.utils';
import { getBuiltinOperatorRuntimes } from '../operators/operator-runtime-registry';
import { configureScriptOperators } from '../operators/script';
import { BUILT_IN_ENRICHERS } from '../enrichers';
import { getAllAdapters as getModuleLevelAdapters, getModuleLevelTransforms, getModuleLevelScripts } from '../adapters/registry';
import { TransformExecutor } from '../transforms/transform-executor';
import { HookService } from '../services/events/hook.service';

function isDataHubAdapter(value: unknown): value is DataHubAdapter {
    if (value == null || typeof value !== 'object') {
        return false;
    }
    const obj = value as Record<string, unknown>;
    return typeof obj.type === 'string' && typeof obj.code === 'string';
}

function isAdapterDefinition(value: unknown): value is AdapterDefinition {
    if (value == null || typeof value !== 'object') {
        return false;
    }
    const obj = value as Record<string, unknown>;
    return typeof obj.type === 'string' && typeof obj.code === 'string' && obj.schema != null;
}

/**
 * Check if a connector adapter has a runtime method (extract/load/apply/etc.),
 * meaning it can be registered as a runtime adapter for execution, not just as
 * a definition for UI display.
 */
function hasRuntimeMethod(value: Record<string, unknown>): boolean {
    return (
        typeof value.extract === 'function' ||
        typeof value.extractAll === 'function' ||
        typeof value.load === 'function' ||
        typeof value.apply === 'function' ||
        typeof value.applyOne === 'function' ||
        typeof value.validate === 'function' ||
        typeof value.enrich === 'function' ||
        typeof value.export === 'function' ||
        typeof value.generateFeed === 'function' ||
        typeof value.index === 'function'
    );
}

/**
 * Registers built-in adapters on module initialization.
 * Also bridges the SDK module-level registry and connector registries
 * so that custom adapters appear in the GraphQL API and dashboard UI.
 */
@Injectable()
export class AdapterBootstrapService implements OnModuleInit {
    private readonly logger: DataHubLogger;

    constructor(
        @Inject(DATAHUB_PLUGIN_OPTIONS) private options: DataHubPluginOptions,
        private registry: DataHubRegistryService,
        private feedGeneratorService: FeedGeneratorService,
        private transformExecutor: TransformExecutor,
        private hookService: HookService,
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
        let sdkBridgedAdapters = 0;
        let connectorBridgedAdapters = 0;
        let sdkBridgedTransforms = 0;
        let sdkBridgedScripts = 0;

        try {
            // Configure script operator security settings
            this.configureScriptSecurity();

            if (this.options.registerBuiltinAdapters !== false) {
                this.logger.debug('Registering built-in adapter definitions', {
                    adapterCount: BUILTIN_ADAPTERS.length,
                });
                for (const adapter of BUILTIN_ADAPTERS) {
                    try {
                        this.registry.register(adapter, { builtIn: true });
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
                        this.registry.registerRuntime(operatorRuntime, { builtIn: true });
                        builtinOperatorRuntimesRegistered++;
                    } catch (err) {
                        // Ignore duplicates between reloads
                        this.logger.debug('Skipped operator runtime registration (likely duplicate)', {
                            operatorCode: operatorRuntime.code,
                        });
                    }
                }

                // Register built-in enricher runtimes
                this.logger.debug('Registering built-in enricher runtimes', {
                    enricherCount: BUILT_IN_ENRICHERS.length,
                });
                for (const enricher of BUILT_IN_ENRICHERS) {
                    try {
                        this.registry.registerRuntime(enricher, { builtIn: true });
                    } catch (err) {
                        this.logger.debug('Skipped enricher runtime registration (likely duplicate)', {
                            enricherCode: enricher.code,
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
                        this.registry.registerRuntime(adapter, { builtIn: false });
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

            // Bridge SDK module-level registry: adapters registered via registerExtractor(), registerLoader(), etc.
            sdkBridgedAdapters = this.bridgeSdkRegistry();

            // Bridge connector registries: extractors and loaders from registered connectors
            connectorBridgedAdapters = this.bridgeConnectorAdapters();

            // Bridge SDK module-level transforms: transforms registered via registerTransform()
            sdkBridgedTransforms = this.bridgeSdkTransforms();

            // Bridge SDK module-level scripts: hook scripts registered via registerScript()
            sdkBridgedScripts = this.bridgeSdkScripts();

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
                sdkBridgedAdapters,
                connectorBridgedAdapters,
                sdkBridgedTransforms,
                sdkBridgedScripts,
                feedGeneratorsRegistered,
                durationMs,
            });
        } catch (err) {
            const durationMs = Date.now() - startTime;
            this.logger.error('DataHub plugin bootstrap failed', toErrorOrUndefined(err), {
                builtinAdaptersRegistered,
                builtinOperatorRuntimesRegistered,
                customAdaptersRegistered,
                sdkBridgedAdapters,
                connectorBridgedAdapters,
                sdkBridgedTransforms,
                sdkBridgedScripts,
                feedGeneratorsRegistered,
                durationMs,
            });
            // Re-throw to let NestJS handle the initialization failure
            throw err;
        }
    }

    /**
     * Bridge adapters from the SDK module-level registry (registered via
     * registerExtractor, registerLoader, etc.) into the DI-managed registry
     * so they appear in the GraphQL API and dashboard UI.
     */
    private bridgeSdkRegistry(): number {
        let bridged = 0;
        const sdkAdapters = getModuleLevelAdapters();

        if (sdkAdapters.length === 0) {
            return 0;
        }

        this.logger.debug('Bridging SDK module-level adapters', {
            adapterCount: sdkAdapters.length,
        });

        for (const adapter of sdkAdapters) {
            try {
                if (!this.registry.find(adapter.type, adapter.code)) {
                    this.registry.register(adapter, { builtIn: false });
                    bridged++;
                }
            } catch (err) {
                this.logger.warn('Failed to bridge SDK adapter', {
                    adapterCode: adapter.code,
                    adapterType: adapter.type,
                    error: getErrorMessage(err),
                });
            }
        }

        if (bridged > 0) {
            this.logger.info('Bridged SDK module-level adapters', { bridged });
        }

        return bridged;
    }

    /**
     * Bridge extractors and loaders from registered connectors into the
     * DI-managed registry so they appear in the GraphQL API and dashboard UI,
     * AND are available for runtime execution by the extract/load executors.
     *
     * Connector adapters implement the SDK adapter interfaces (ExtractorAdapter,
     * LoaderAdapter) which are members of the DataHubAdapter union. Using
     * registerRuntime() registers both the definition (for UI) and the runtime
     * adapter (for execution) in a single call.
     */
    private bridgeConnectorAdapters(): number {
        let bridged = 0;
        const connectors = this.options.connectors;

        if (!connectors?.length) {
            return 0;
        }

        this.logger.debug('Bridging connector adapters', {
            connectorCount: connectors.length,
        });

        for (const connectorEntry of connectors) {
            const definition = connectorEntry.definition;

            // Bridge extractors from the connector definition
            if (definition.extractors) {
                for (const extractor of definition.extractors) {
                    if (!isAdapterDefinition(extractor)) {
                        this.logger.warn('Invalid connector extractor structure - missing type, code, or schema');
                        continue;
                    }
                    try {
                        if (!this.registry.find(extractor.type, extractor.code)) {
                            const obj = extractor as unknown as Record<string, unknown>;
                            if (hasRuntimeMethod(obj)) {
                                // Connector extractor has an extract() method: register as runtime
                                // adapter so executors can find it via getRuntime().
                                // registerRuntime() also auto-registers the definition for UI display.
                                this.registry.registerRuntime(extractor as unknown as DataHubAdapter, { builtIn: false });
                            } else {
                                // Definition-only: register for UI display without runtime
                                this.registry.register(extractor, { builtIn: false });
                            }
                            bridged++;
                        }
                    } catch (err) {
                        this.logger.warn('Failed to bridge connector extractor', {
                            adapterCode: extractor.code,
                            error: getErrorMessage(err),
                        });
                    }
                }
            }

            // Bridge loaders from the connector definition
            if (definition.loaders) {
                for (const loader of definition.loaders) {
                    if (!isAdapterDefinition(loader)) {
                        this.logger.warn('Invalid connector loader structure - missing type, code, or schema');
                        continue;
                    }
                    try {
                        if (!this.registry.find(loader.type, loader.code)) {
                            const obj = loader as unknown as Record<string, unknown>;
                            if (hasRuntimeMethod(obj)) {
                                // Connector loader has a load() method: register as runtime
                                // adapter so executors can find it via getRuntime().
                                // registerRuntime() also auto-registers the definition for UI display.
                                this.registry.registerRuntime(loader as unknown as DataHubAdapter, { builtIn: false });
                            } else {
                                // Definition-only: register for UI display without runtime
                                this.registry.register(loader, { builtIn: false });
                            }
                            bridged++;
                        }
                    } catch (err) {
                        this.logger.warn('Failed to bridge connector loader', {
                            adapterCode: loader.code,
                            error: getErrorMessage(err),
                        });
                    }
                }
            }
        }

        if (bridged > 0) {
            this.logger.info('Bridged connector adapters', { bridged });
        }

        return bridged;
    }

    /**
     * Bridge custom transforms from the SDK module-level registry (registered via
     * registerTransform()) into the TransformExecutor so they can be used in
     * TransformConfig chains.
     */
    private bridgeSdkTransforms(): number {
        let bridged = 0;
        const sdkTransforms = getModuleLevelTransforms();

        if (sdkTransforms.length === 0) {
            return 0;
        }

        this.logger.debug('Bridging SDK module-level transforms', {
            transformCount: sdkTransforms.length,
        });

        for (const transform of sdkTransforms) {
            try {
                this.transformExecutor.registerCustomTransform(transform);
                bridged++;
            } catch (err) {
                this.logger.warn('Failed to bridge custom transform', {
                    transformType: transform.type,
                    error: getErrorMessage(err),
                });
            }
        }

        if (bridged > 0) {
            this.logger.info('Bridged SDK custom transforms', { bridged });
        }

        return bridged;
    }

    /**
     * Bridge hook scripts from the SDK module-level registry (registered via
     * registerScript()) into the HookService so they can be used in hook
     * configurations.
     */
    private bridgeSdkScripts(): number {
        let bridged = 0;
        const sdkScripts = getModuleLevelScripts();

        if (sdkScripts.length === 0) {
            return 0;
        }

        this.logger.debug('Bridging SDK module-level hook scripts', {
            scriptCount: sdkScripts.length,
        });

        for (const script of sdkScripts) {
            try {
                this.hookService.registerScript(script.name, script.fn);
                bridged++;
            } catch (err) {
                this.logger.warn('Failed to bridge hook script', {
                    scriptName: script.name,
                    error: getErrorMessage(err),
                });
            }
        }

        if (bridged > 0) {
            this.logger.info('Bridged SDK hook scripts', { bridged });
        }

        return bridged;
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
