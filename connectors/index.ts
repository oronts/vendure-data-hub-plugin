/**
 * Connectors Pack - Enterprise Integrations Hub
 *
 * Pre-built connectors for enterprise systems:
 * - Pimcore PIM
 * - SAP (coming soon)
 * - Akeneo (coming soon)
 * - Shopify (coming soon)
 *
 * @example
 * ```typescript
 * import { PimcoreConnector } from '@vendure-datahub/connectors/pimcore';
 *
 * DataHubPlugin.init({
 *   connectors: [
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
