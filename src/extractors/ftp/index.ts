export * from './types';

export {
    FtpClient,
    FtpConnectionOptions,
    SftpConnectionOptions,
    createFtpClient,
    createSftpClient,
    createClient,
    buildFtpConnectionOptions,
    buildSftpConnectionOptions,
    testConnection,
    buildFtpSourceId,
} from './connection';

export {
    matchesPattern,
    filterByPattern,
    filterByModifiedAfter,
    filterFiles,
    detectFileFormat,
    ParseFileOptions,
    parseFtpContent,
    buildFileMetadata,
    attachMetadataToRecord,
    calculateDestinationPath,
    parseModifiedAfterDate,
    isValidRemotePath,
    isValidHost,
    isValidPort,
    getFileExtension,
    hasExpectedExtension,
} from './file-operations';

export { FtpExtractor } from './ftp.extractor';
