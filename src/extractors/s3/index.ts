export * from './types';

export {
    S3Client,
    S3ListObjectsResult,
    S3ClientConfig,
    createS3Client,
    buildS3ClientConfig,
    testS3Connection,
    buildS3SourceId,
} from './client';

export {
    filterBySuffix,
    filterByModifiedAfter,
    filterObjects,
    detectFileFormat,
    ParseContentOptions,
    parseS3Content,
    buildObjectMetadata,
    attachMetadataToRecord,
    calculateDestinationKey,
    isValidBucketName,
    isValidPrefix,
    parseModifiedAfterDate,
    estimateObjectCount,
} from './file-handlers';

export { S3Extractor } from './s3.extractor';
