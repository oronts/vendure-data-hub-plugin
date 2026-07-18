import type { PimcoreGraphQLExtractorConfig } from '../extractors/pimcore-graphql.extractor';
import type { PimcoreConnectorConfig } from '../types';
import { PIMCORE_EXTRACTOR_LIMITS } from '../constants';

type PimcoreEntityType = PimcoreGraphQLExtractorConfig['entityType'];
type GeneratedPimcoreExtractorConfig = Pick<
    PimcoreGraphQLExtractorConfig,
    | 'connectionCode'
    | 'entityType'
    | 'first'
    | 'maxPages'
    | 'includeUnpublished'
    | 'timeoutMs'
>;

export function createPimcoreExtractorConfig(
    config: PimcoreConnectorConfig,
    entityType: PimcoreEntityType,
    defaultPageSize: number,
): GeneratedPimcoreExtractorConfig {
    return {
        connectionCode: config.connectionCode,
        entityType,
        first: config.sync?.batchSize ?? defaultPageSize,
        maxPages: config.sync?.maxPages ?? PIMCORE_EXTRACTOR_LIMITS.DEFAULT_MAX_PAGES,
        timeoutMs: config.timeoutMs ?? PIMCORE_EXTRACTOR_LIMITS.DEFAULT_TIMEOUT_MS,
        ...(entityType === 'asset'
            ? {}
            : { includeUnpublished: config.sync?.includeUnpublished ?? false }),
    };
}
