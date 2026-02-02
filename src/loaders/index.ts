export * from '../types/index';

// Base loader infrastructure
export {
    BaseEntityLoader,
    LoaderMetadata,
    ExistingEntityLookupResult,
    ValidationBuilder,
    ValidationError,
    ValidationWarning,
    createValidationResult,
    EntityLookupHelper,
    LookupStrategy,
    createLookupHelper,
} from './base';

// Shared helpers
export {
    slugify,
    isRecoverableError,
    shouldUpdateField,
    isValidEmail,
    buildConfigurableOperation,
    buildConfigurableOperations,
} from './shared-helpers';

export { LoaderRegistryService, LoaderRegistrationCallback } from './registry';

export { ProductLoader } from './product';
export type { ProductInput } from './product';

export { ProductVariantLoader } from './product-variant';
export type { ProductVariantInput } from './product-variant';

export { CustomerLoader } from './customer';
export type { CustomerInput, CustomerAddressInput } from './customer';

export { CustomerGroupLoader } from './customer-group';
export type { CustomerGroupInput } from './customer-group';

export { OrderLoader } from './order';
export type { OrderInput, OrderLineInput, OrderAddressInput } from './order';

export { CollectionLoader } from './collection';
export type { CollectionInput, CollectionFilterInput } from './collection';

export { FacetLoader } from './facet';
export type { FacetInput } from './facet';

export { FacetValueLoader } from './facet-value';
export type { FacetValueInput } from './facet-value';

export { AssetLoader } from './asset';
export type { AssetInput, FocalPointInput } from './asset';

export { PromotionLoader } from './promotion';
export type { PromotionInput, PromotionConditionInput, PromotionActionInput } from './promotion';

export { ShippingMethodLoader } from './shipping-method';
export type { ShippingMethodInput, ShippingCalculatorInput, ShippingCheckerInput } from './shipping-method';

export { InventoryLoader } from './inventory';
export type { InventoryInput } from './inventory';

export { StockLocationLoader } from './stock-location';
export type { StockLocationInput } from './stock-location';

export { TaxRateLoader } from './tax-rate';
export type { TaxRateInput } from './tax-rate';

export { PaymentMethodLoader } from './payment-method';
export type { PaymentMethodInput, ConfigurableOperationInput as PaymentConfigurableOperationInput } from './payment-method';

export { ChannelLoader } from './channel';
export type { ChannelInput } from './channel';
