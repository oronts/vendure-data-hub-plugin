export * from './types';

export {
    buildUrl,
    buildHeaders,
    buildPaginatedRequest,
    buildGraphqlBody,
    isValidUrl,
    getMethod,
    prepareRequestBody,
    methodSupportsBody,
} from './request-builder';

export {
    extractRecords,
    getValueByPath,
    parseResponseHeaders,
    buildHttpResponse,
    isSuccessResponse,
    isRateLimitResponse,
    getRetryAfterMs,
    extractErrorMessage,
    extractTotalCount,
    flattenRecord,
} from './response-parser';

export {
    updatePaginationState,
    parseLinkHeader,
    getNextPageUrl,
    initPaginationState,
    isPaginationEnabled,
    getPaginationType,
    estimateTotalPages,
    hasReachedMaxPages,
} from './pagination';

export { HttpApiExtractor } from './http-api.extractor';
