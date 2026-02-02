/**
 * Base Loader Module
 *
 * Provides abstract base classes and utilities for building entity loaders.
 *
 * @module loaders/base
 */

export {
    BaseEntityLoader,
    LoaderMetadata,
    ExistingEntityLookupResult,
} from './base-loader';

export {
    ValidationBuilder,
    ValidationError,
    ValidationWarning,
    createValidationResult,
} from './validation-builder';

export {
    EntityLookupHelper,
    LookupStrategy,
    createLookupHelper,
} from './entity-lookup-helper';
