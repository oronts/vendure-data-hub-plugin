/**
 * Connectors Pack - Third-party System Connectors
 *
 * Pre-built connectors for external systems:
 * - Pimcore PIM
 *
 * @example
 * ```typescript
 * import { DataHubPlugin } from '@oronts/vendure-data-hub-plugin';
 * import { PimcoreConnector } from '@oronts/vendure-data-hub-plugin/connectors/pimcore';
 *
 * const pimcore = PimcoreConnector({
 *   connectionCode: 'pimcore-graphql',
 * });
 *
 * DataHubPlugin.init({
 *   connectors: [pimcore],
 *   pipelines: pimcore.pipelines,
 * });
 * ```
 */

export * from './types';
export * from './registry';

// Connector exports
export * from './pimcore';
