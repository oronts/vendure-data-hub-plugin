/**
 * Connectors Pack - Third-party System Connectors
 *
 * Pre-built connectors for external systems:
 * - Pimcore PIM
 *
 * @example
 * ```typescript
 * import { PimcoreConnector } from '@oronts/vendure-data-hub-plugin/connectors/pimcore';
 *
 * DataHubPlugin.init({
 *   pipelines: [
 *     PimcoreConnector({
 *       endpoint: 'https://pimcore.company.com/pimcore-datahub-webservices/shop',
 *       apiKey: process.env.PIMCORE_API_KEY,
 *     }),
 *   ],
 * })
 * ```
 */

export * from './types';
export * from './registry';

// Connector exports
export * from './pimcore';
