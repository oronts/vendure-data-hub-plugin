export * from '../types/index';

// Shared utilities for extractors (eliminates duplication)
export {
    extractFileExtension,
    detectFileFormat,
    getFileExtension,
    hasExpectedExtension,
    FileParseOptions,
    parseFileContent,
    parseModifiedAfterDate,
    filterByModifiedAfter,
    attachMetadataToRecord,
} from './shared';

export {
    ExtractorRegistryService,
    ExtractorRegistrationCallback,
    ExtractorMetadata as RegistryExtractorMetadata,
    ExtractorInfo,
} from './extractor-registry.service';

export { HttpApiExtractor } from './http-api';
export { HttpApiExtractorConfig } from './http-api';

export { DatabaseExtractor } from './database';
export { DatabaseExtractorConfig } from './database';

export { S3Extractor } from './s3';
export { S3ExtractorConfig } from './s3';

export { FtpExtractor } from './ftp';
export { FtpExtractorConfig } from './ftp';

export { FileExtractor } from './file';
export { FileExtractorConfig } from './file';

export { VendureQueryExtractor } from './vendure-query';
export { VendureQueryExtractorConfig, VendureQueryFilter } from './vendure-query';

export { WebhookExtractor } from './webhook';
export { WebhookExtractorConfig } from './webhook';

export { GraphQLExtractor } from './graphql';
export { GraphQLExtractorConfig, GraphQLPaginationConfig } from './graphql';

export { CdcExtractor } from './cdc';
export { CdcExtractorConfig } from './cdc';
