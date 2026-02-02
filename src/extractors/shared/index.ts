/**
 * Shared Extractor Utilities
 *
 * Common utilities used across multiple extractor implementations
 * to eliminate code duplication.
 *
 * @module extractors/shared
 */

export {
    FILE_FORMAT_MAP,
    detectFileFormat,
    getFileExtension,
    hasExpectedExtension,
    FileParseOptions,
    parseFileContent,
    parseModifiedAfterDate,
    filterByModifiedAfter,
    BaseFileMetadata,
    attachMetadataToRecord,
} from './file-format.utils';
