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
 *   connectors: [
 *     PimcoreConnector({
 *       connection: {
 *         endpoint: 'https://pimcore.company.com/pimcore-datahub-webservices/shop',
 *         apiKeySecretCode: 'pimcore-api-key',
 *       },
 *     }),
 *   ],
 * });
 * ```
 */

export * from './types';
export * from './registry';

// Connector exports
export * from './pimcore';
