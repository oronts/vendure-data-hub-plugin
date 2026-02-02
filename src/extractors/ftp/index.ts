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
    parseFtpContent,
    buildFileMetadata,
    attachMetadataToRecord,
    calculateDestinationPath,
    isValidRemotePath,
    isValidHost,
    isValidPort,
} from './file-operations';

export { FtpExtractor } from './ftp.extractor';
