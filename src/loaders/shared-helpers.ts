export { isRecoverableError } from './error-utils';
export { slugify } from '../operators/helpers';
export {
    buildConfigurableOperation,
    buildConfigurableOperations,
    createChannelScopedCacheKey,
    findVariantBySku,
    getArrayValue,
    getIdValue,
    getNumberValue,
    getObjectValue,
    getStringValue,
    shouldUpdateField,
} from './shared-record-helpers';
export type {
    ConfigurableOperation,
    ConfigurableOperationInput,
} from './shared-record-helpers';
export {
    handleAssets,
    handleFacetValues,
    handleFeaturedAsset,
    resolveFacetValueIds,
} from './shared-entity-helpers';
