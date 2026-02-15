/**
 * Connector Registry
 *
 * Manages registration, validation, and lifecycle of connectors.
 */

import {
    ConnectorDefinition,
    ConnectorInstance,
    ConnectorRegistrationResult,
    BaseConnectorConfig,
} from './types';
import { PipelineDefinition } from '../src/types';
import { ExtractorAdapter, LoaderAdapter } from '../src/sdk/types';
import { getErrorMessage } from '../src/utils/error.utils';

/** Maximum number of registered connectors to prevent unbounded memory growth */
const MAX_CONNECTORS = 1000;

/**
 * Registry for managing DataHub connectors
 */
export class ConnectorRegistry {
    private connectors: Map<string, ConnectorInstance> = new Map();
    private extractors: Map<string, ExtractorAdapter<unknown>> = new Map();
    private loaders: Map<string, LoaderAdapter<unknown>> = new Map();

    /**
     * Register a connector with its configuration
     */
    register<TConfig extends BaseConnectorConfig>(
        connector: ConnectorDefinition<TConfig>,
        config: TConfig,
    ): ConnectorRegistrationResult {
        // Enforce size limit to prevent unbounded memory growth
        if (!this.connectors.has(connector.code) && this.connectors.size >= MAX_CONNECTORS) {
            return {
                success: false,
                connectorCode: connector.code,
                pipelineCount: 0,
                extractorCount: 0,
                loaderCount: 0,
                errors: [`Connector registry is full (max ${MAX_CONNECTORS}). Unregister a connector first.`],
            };
        }

        const errors: string[] = [];

        // Merge with default config
        const mergedConfig = {
            ...connector.defaultConfig,
            ...config,
        } as TConfig;

        // Validate config if validator provided
        if (connector.validateConfig) {
            const validation = connector.validateConfig(mergedConfig);
            if (!validation.valid) {
                return {
                    success: false,
                    connectorCode: connector.code,
                    pipelineCount: 0,
                    extractorCount: 0,
                    loaderCount: 0,
                    errors: validation.errors,
                };
            }
        }

        // Generate pipelines
        let pipelines: PipelineDefinition[] = [];
        try {
            pipelines = connector.createPipelines(mergedConfig);
        } catch (err) {
            errors.push(`Failed to create pipelines: ${getErrorMessage(err)}`);
            return {
                success: false,
                connectorCode: connector.code,
                pipelineCount: 0,
                extractorCount: 0,
                loaderCount: 0,
                errors,
            };
        }

        // Register extractors
        if (connector.extractors) {
            for (const extractor of connector.extractors) {
                const code = `${connector.code}:${extractor.code}`;
                this.extractors.set(code, { ...extractor, code });
            }
        }

        // Register loaders
        if (connector.loaders) {
            for (const loader of connector.loaders) {
                const code = `${connector.code}:${loader.code}`;
                this.loaders.set(code, { ...loader, code });
            }
        }

        // Store connector instance
        this.connectors.set(connector.code, {
            connector: connector as ConnectorDefinition<BaseConnectorConfig>,
            config: mergedConfig,
            pipelines,
        });

        return {
            success: true,
            connectorCode: connector.code,
            pipelineCount: pipelines.length,
            extractorCount: connector.extractors?.length ?? 0,
            loaderCount: connector.loaders?.length ?? 0,
        };
    }

    /**
     * Get all registered connectors
     */
    getConnectors(): ConnectorInstance[] {
        return Array.from(this.connectors.values());
    }

    /**
     * Get a specific connector by code
     */
    getConnector(code: string): ConnectorInstance | undefined {
        return this.connectors.get(code);
    }

    /**
     * Get all pipelines from all connectors
     */
    getAllPipelines(): PipelineDefinition[] {
        const pipelines: PipelineDefinition[] = [];
        for (const instance of this.connectors.values()) {
            pipelines.push(...instance.pipelines);
        }
        return pipelines;
    }

    /**
     * Get pipelines for a specific connector
     */
    getPipelines(connectorCode: string): PipelineDefinition[] {
        const instance = this.connectors.get(connectorCode);
        return instance?.pipelines ?? [];
    }

    /**
     * Get all registered extractors
     */
    getExtractors(): ExtractorAdapter<unknown>[] {
        return Array.from(this.extractors.values());
    }

    /**
     * Get all registered loaders
     */
    getLoaders(): LoaderAdapter<unknown>[] {
        return Array.from(this.loaders.values());
    }

    /**
     * Check if a connector is registered
     */
    hasConnector(code: string): boolean {
        return this.connectors.has(code);
    }

    /**
     * Unregister a connector
     */
    unregister(code: string): boolean {
        const instance = this.connectors.get(code);
        if (!instance) return false;

        // Remove extractors
        if (instance.connector.extractors) {
            for (const extractor of instance.connector.extractors) {
                this.extractors.delete(`${code}:${extractor.code}`);
            }
        }

        // Remove loaders
        if (instance.connector.loaders) {
            for (const loader of instance.connector.loaders) {
                this.loaders.delete(`${code}:${loader.code}`);
            }
        }

        return this.connectors.delete(code);
    }

    /**
     * Clear all registrations
     */
    clear(): void {
        this.connectors.clear();
        this.extractors.clear();
        this.loaders.clear();
    }
}

/**
 * Global connector registry instance
 */
export const connectorRegistry = new ConnectorRegistry();

/**
 * Helper to create a connector factory function
 */
export function defineConnector<TConfig extends BaseConnectorConfig>(
    definition: ConnectorDefinition<TConfig>,
): (config: TConfig) => { definition: ConnectorDefinition<TConfig>; config: TConfig } {
    return (config: TConfig) => ({
        definition,
        config,
    });
}
