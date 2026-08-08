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


export { VendureQueryExtractor } from './vendure-query';
export { VendureQueryExtractorConfig, VendureQueryFilter } from './vendure-query';

export { GraphQLExtractor } from './graphql';
export { GraphQLExtractorConfig, GraphQLPaginationConfig } from './graphql';

export { CdcExtractor } from './cdc';
export { CdcExtractorConfig } from './cdc';
