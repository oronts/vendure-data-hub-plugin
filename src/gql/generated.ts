export type Maybe<T> = T;
export type InputMaybe<T> = T;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string | number; output: string | number; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  DateTime: { input: string; output: string; }
  JSON: { input: Record<string, unknown>; output: Record<string, unknown>; }
  Money: { input: number; output: number; }
  Upload: { input: File; output: File; }
};

export type AddFulfillmentToOrderResult = CreateFulfillmentError | EmptyOrderLineSelectionError | Fulfillment | FulfillmentStateTransitionError | InsufficientStockOnHandError | InvalidFulfillmentHandlerError | ItemsAlreadyFulfilledError;

export type AddItemInput = {
  productVariantId: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
};

export type AddItemToDraftOrderInput = {
  productVariantId: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
};

export type AddManualPaymentToOrderResult = ManualPaymentStateError | Order;

export type AddNoteToCustomerInput = {
  id: Scalars['ID']['input'];
  isPublic: Scalars['Boolean']['input'];
  note: Scalars['String']['input'];
};

export type AddNoteToOrderInput = {
  id: Scalars['ID']['input'];
  isPublic: Scalars['Boolean']['input'];
  note: Scalars['String']['input'];
};

export type Address = Node & {
  __typename?: 'Address';
  city?: Maybe<Scalars['String']['output']>;
  company?: Maybe<Scalars['String']['output']>;
  country: Country;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  defaultBillingAddress?: Maybe<Scalars['Boolean']['output']>;
  defaultShippingAddress?: Maybe<Scalars['Boolean']['output']>;
  fullName?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  phoneNumber?: Maybe<Scalars['String']['output']>;
  postalCode?: Maybe<Scalars['String']['output']>;
  province?: Maybe<Scalars['String']['output']>;
  streetLine1: Scalars['String']['output'];
  streetLine2?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type AdjustDraftOrderLineInput = {
  orderLineId: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
};

export type Adjustment = {
  __typename?: 'Adjustment';
  adjustmentSource: Scalars['String']['output'];
  amount: Scalars['Money']['output'];
  data?: Maybe<Scalars['JSON']['output']>;
  description: Scalars['String']['output'];
  type: AdjustmentType;
};

export enum AdjustmentType {
  DISTRIBUTED_ORDER_PROMOTION = 'DISTRIBUTED_ORDER_PROMOTION',
  OTHER = 'OTHER',
  PROMOTION = 'PROMOTION'
}

export type Administrator = Node & {
  __typename?: 'Administrator';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  emailAddress: Scalars['String']['output'];
  firstName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  lastName: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  user: User;
};

export type AdministratorFilterParameter = {
  _and?: InputMaybe<Array<AdministratorFilterParameter>>;
  _or?: InputMaybe<Array<AdministratorFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  emailAddress?: InputMaybe<StringOperators>;
  firstName?: InputMaybe<StringOperators>;
  id?: InputMaybe<IdOperators>;
  lastName?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type AdministratorList = PaginatedList & {
  __typename?: 'AdministratorList';
  items: Array<Administrator>;
  totalItems: Scalars['Int']['output'];
};

export type AdministratorListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<AdministratorFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<AdministratorSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type AdministratorPaymentInput = {
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  paymentMethod?: InputMaybe<Scalars['String']['input']>;
};

export type AdministratorRefundInput = {
  /**
   * The amount to be refunded to this particular Payment. This was introduced in
   * v2.2.0 as the preferred way to specify the refund amount. The `lines`, `shipping` and `adjustment`
   * fields will be removed in a future version.
   */
  amount?: InputMaybe<Scalars['Money']['input']>;
  paymentId: Scalars['ID']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
};

export type AdministratorSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  emailAddress?: InputMaybe<SortOrder>;
  firstName?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lastName?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type Allocation = Node & StockMovement & {
  __typename?: 'Allocation';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  orderLine: OrderLine;
  productVariant: ProductVariant;
  quantity: Scalars['Int']['output'];
  type: StockMovementType;
  updatedAt: Scalars['DateTime']['output'];
};

/** Returned if an attempting to refund an OrderItem which has already been refunded */
export type AlreadyRefundedError = ErrorResult & {
  __typename?: 'AlreadyRefundedError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
  refundId: Scalars['ID']['output'];
};

export type ApplyCouponCodeResult = CouponCodeExpiredError | CouponCodeInvalidError | CouponCodeLimitError | Order;

export type Asset = Node & {
  __typename?: 'Asset';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  fileSize: Scalars['Int']['output'];
  focalPoint?: Maybe<Coordinate>;
  height: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  mimeType: Scalars['String']['output'];
  name: Scalars['String']['output'];
  preview: Scalars['String']['output'];
  source: Scalars['String']['output'];
  tags: Array<Tag>;
  type: AssetType;
  updatedAt: Scalars['DateTime']['output'];
  width: Scalars['Int']['output'];
};

export type AssetFilterParameter = {
  _and?: InputMaybe<Array<AssetFilterParameter>>;
  _or?: InputMaybe<Array<AssetFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  fileSize?: InputMaybe<NumberOperators>;
  height?: InputMaybe<NumberOperators>;
  id?: InputMaybe<IdOperators>;
  mimeType?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  preview?: InputMaybe<StringOperators>;
  source?: InputMaybe<StringOperators>;
  type?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
  width?: InputMaybe<NumberOperators>;
};

export type AssetList = PaginatedList & {
  __typename?: 'AssetList';
  items: Array<Asset>;
  totalItems: Scalars['Int']['output'];
};

export type AssetListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<AssetFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<AssetSortParameter>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
  tagsOperator?: InputMaybe<LogicalOperator>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type AssetSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  fileSize?: InputMaybe<SortOrder>;
  height?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  mimeType?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  preview?: InputMaybe<SortOrder>;
  source?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
  width?: InputMaybe<SortOrder>;
};

export enum AssetType {
  BINARY = 'BINARY',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO'
}

export type AssignAssetsToChannelInput = {
  assetIds: Array<Scalars['ID']['input']>;
  channelId: Scalars['ID']['input'];
};

export type AssignCollectionsToChannelInput = {
  channelId: Scalars['ID']['input'];
  collectionIds: Array<Scalars['ID']['input']>;
};

export type AssignFacetsToChannelInput = {
  channelId: Scalars['ID']['input'];
  facetIds: Array<Scalars['ID']['input']>;
};

export type AssignPaymentMethodsToChannelInput = {
  channelId: Scalars['ID']['input'];
  paymentMethodIds: Array<Scalars['ID']['input']>;
};

export type AssignProductVariantsToChannelInput = {
  channelId: Scalars['ID']['input'];
  priceFactor?: InputMaybe<Scalars['Float']['input']>;
  productVariantIds: Array<Scalars['ID']['input']>;
};

export type AssignProductsToChannelInput = {
  channelId: Scalars['ID']['input'];
  priceFactor?: InputMaybe<Scalars['Float']['input']>;
  productIds: Array<Scalars['ID']['input']>;
};

export type AssignPromotionsToChannelInput = {
  channelId: Scalars['ID']['input'];
  promotionIds: Array<Scalars['ID']['input']>;
};

export type AssignShippingMethodsToChannelInput = {
  channelId: Scalars['ID']['input'];
  shippingMethodIds: Array<Scalars['ID']['input']>;
};

export type AssignStockLocationsToChannelInput = {
  channelId: Scalars['ID']['input'];
  stockLocationIds: Array<Scalars['ID']['input']>;
};

export type AuthenticationInput = {
  native?: InputMaybe<NativeAuthInput>;
};

export type AuthenticationMethod = Node & {
  __typename?: 'AuthenticationMethod';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  strategy: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type AuthenticationResult = CurrentUser | InvalidCredentialsError;

export type BooleanCustomFieldConfig = CustomField & {
  __typename?: 'BooleanCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

/** Operators for filtering on a list of Boolean fields */
export type BooleanListOperators = {
  inList: Scalars['Boolean']['input'];
};

/** Operators for filtering on a Boolean field */
export type BooleanOperators = {
  eq?: InputMaybe<Scalars['Boolean']['input']>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type BooleanStructFieldConfig = StructField & {
  __typename?: 'BooleanStructFieldConfig';
  description?: Maybe<Array<LocalizedString>>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

/** Returned if an attempting to cancel lines from an Order which is still active */
export type CancelActiveOrderError = ErrorResult & {
  __typename?: 'CancelActiveOrderError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
  orderState: Scalars['String']['output'];
};

export type CancelOrderInput = {
  /** Specify whether the shipping charges should also be cancelled. Defaults to false */
  cancelShipping?: InputMaybe<Scalars['Boolean']['input']>;
  /** Optionally specify which OrderLines to cancel. If not provided, all OrderLines will be cancelled */
  lines?: InputMaybe<Array<OrderLineInput>>;
  /** The id of the order to be cancelled */
  orderId: Scalars['ID']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
};

export type CancelOrderResult = CancelActiveOrderError | EmptyOrderLineSelectionError | MultipleOrderError | Order | OrderStateTransitionError | QuantityTooGreatError;

/** Returned if the Payment cancellation fails */
export type CancelPaymentError = ErrorResult & {
  __typename?: 'CancelPaymentError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
  paymentErrorMessage: Scalars['String']['output'];
};

export type CancelPaymentResult = CancelPaymentError | Payment | PaymentStateTransitionError;

export type Cancellation = Node & StockMovement & {
  __typename?: 'Cancellation';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  orderLine: OrderLine;
  productVariant: ProductVariant;
  quantity: Scalars['Int']['output'];
  type: StockMovementType;
  updatedAt: Scalars['DateTime']['output'];
};

export type Channel = Node & {
  __typename?: 'Channel';
  availableCurrencyCodes: Array<CurrencyCode>;
  availableLanguageCodes?: Maybe<Array<LanguageCode>>;
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  /** @deprecated Use defaultCurrencyCode instead */
  currencyCode: CurrencyCode;
  customFields?: Maybe<Scalars['JSON']['output']>;
  defaultCurrencyCode: CurrencyCode;
  defaultLanguageCode: LanguageCode;
  defaultShippingZone?: Maybe<Zone>;
  defaultTaxZone?: Maybe<Zone>;
  id: Scalars['ID']['output'];
  /** Not yet used - will be implemented in a future release. */
  outOfStockThreshold?: Maybe<Scalars['Int']['output']>;
  pricesIncludeTax: Scalars['Boolean']['output'];
  seller?: Maybe<Seller>;
  token: Scalars['String']['output'];
  /** Not yet used - will be implemented in a future release. */
  trackInventory?: Maybe<Scalars['Boolean']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

/**
 * Returned when the default LanguageCode of a Channel is no longer found in the `availableLanguages`
 * of the GlobalSettings
 */
export type ChannelDefaultLanguageError = ErrorResult & {
  __typename?: 'ChannelDefaultLanguageError';
  channelCode: Scalars['String']['output'];
  errorCode: ErrorCode;
  language: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type ChannelFilterParameter = {
  _and?: InputMaybe<Array<ChannelFilterParameter>>;
  _or?: InputMaybe<Array<ChannelFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  currencyCode?: InputMaybe<StringOperators>;
  defaultCurrencyCode?: InputMaybe<StringOperators>;
  defaultLanguageCode?: InputMaybe<StringOperators>;
  id?: InputMaybe<IdOperators>;
  outOfStockThreshold?: InputMaybe<NumberOperators>;
  pricesIncludeTax?: InputMaybe<BooleanOperators>;
  token?: InputMaybe<StringOperators>;
  trackInventory?: InputMaybe<BooleanOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type ChannelList = PaginatedList & {
  __typename?: 'ChannelList';
  items: Array<Channel>;
  totalItems: Scalars['Int']['output'];
};

export type ChannelListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<ChannelFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<ChannelSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type ChannelSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  outOfStockThreshold?: InputMaybe<SortOrder>;
  token?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type Collection = Node & {
  __typename?: 'Collection';
  assets: Array<Asset>;
  breadcrumbs: Array<CollectionBreadcrumb>;
  children?: Maybe<Array<Collection>>;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  description: Scalars['String']['output'];
  featuredAsset?: Maybe<Asset>;
  filters: Array<ConfigurableOperation>;
  id: Scalars['ID']['output'];
  inheritFilters: Scalars['Boolean']['output'];
  isPrivate: Scalars['Boolean']['output'];
  languageCode?: Maybe<LanguageCode>;
  name: Scalars['String']['output'];
  parent?: Maybe<Collection>;
  parentId: Scalars['ID']['output'];
  position: Scalars['Int']['output'];
  productVariants: ProductVariantList;
  slug: Scalars['String']['output'];
  translations: Array<CollectionTranslation>;
  updatedAt: Scalars['DateTime']['output'];
};


export type CollectionProductVariantsArgs = {
  options?: InputMaybe<ProductVariantListOptions>;
};

export type CollectionBreadcrumb = {
  __typename?: 'CollectionBreadcrumb';
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
};

export type CollectionFilterParameter = {
  _and?: InputMaybe<Array<CollectionFilterParameter>>;
  _or?: InputMaybe<Array<CollectionFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  description?: InputMaybe<StringOperators>;
  id?: InputMaybe<IdOperators>;
  inheritFilters?: InputMaybe<BooleanOperators>;
  isPrivate?: InputMaybe<BooleanOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  parentId?: InputMaybe<IdOperators>;
  position?: InputMaybe<NumberOperators>;
  slug?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type CollectionList = PaginatedList & {
  __typename?: 'CollectionList';
  items: Array<Collection>;
  totalItems: Scalars['Int']['output'];
};

export type CollectionListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<CollectionFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<CollectionSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
  topLevelOnly?: InputMaybe<Scalars['Boolean']['input']>;
};

/**
 * Which Collections are present in the products returned
 * by the search, and in what quantity.
 */
export type CollectionResult = {
  __typename?: 'CollectionResult';
  collection: Collection;
  count: Scalars['Int']['output'];
};

export type CollectionSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  parentId?: InputMaybe<SortOrder>;
  position?: InputMaybe<SortOrder>;
  slug?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type CollectionTranslation = {
  __typename?: 'CollectionTranslation';
  createdAt: Scalars['DateTime']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ConfigArg = {
  __typename?: 'ConfigArg';
  name: Scalars['String']['output'];
  value: Scalars['String']['output'];
};

export type ConfigArgDefinition = {
  __typename?: 'ConfigArgDefinition';
  defaultValue?: Maybe<Scalars['JSON']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  label?: Maybe<Scalars['String']['output']>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  required: Scalars['Boolean']['output'];
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type ConfigArgInput = {
  name: Scalars['String']['input'];
  /** A JSON stringified representation of the actual value */
  value: Scalars['String']['input'];
};

export type ConfigurableOperation = {
  __typename?: 'ConfigurableOperation';
  args: Array<ConfigArg>;
  code: Scalars['String']['output'];
};

export type ConfigurableOperationDefinition = {
  __typename?: 'ConfigurableOperationDefinition';
  args: Array<ConfigArgDefinition>;
  code: Scalars['String']['output'];
  description: Scalars['String']['output'];
};

export type ConfigurableOperationInput = {
  arguments: Array<ConfigArgInput>;
  code: Scalars['String']['input'];
};

export type Coordinate = {
  __typename?: 'Coordinate';
  x: Scalars['Float']['output'];
  y: Scalars['Float']['output'];
};

export type CoordinateInput = {
  x: Scalars['Float']['input'];
  y: Scalars['Float']['input'];
};

/**
 * A Country of the world which your shop operates in.
 *
 * The `code` field is typically a 2-character ISO code such as "GB", "US", "DE" etc. This code is used in certain inputs such as
 * `UpdateAddressInput` and `CreateAddressInput` to specify the country.
 */
export type Country = Node & Region & {
  __typename?: 'Country';
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  enabled: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  parent?: Maybe<Region>;
  parentId?: Maybe<Scalars['ID']['output']>;
  translations: Array<RegionTranslation>;
  type: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type CountryFilterParameter = {
  _and?: InputMaybe<Array<CountryFilterParameter>>;
  _or?: InputMaybe<Array<CountryFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  enabled?: InputMaybe<BooleanOperators>;
  id?: InputMaybe<IdOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  parentId?: InputMaybe<IdOperators>;
  type?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type CountryList = PaginatedList & {
  __typename?: 'CountryList';
  items: Array<Country>;
  totalItems: Scalars['Int']['output'];
};

export type CountryListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<CountryFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<CountrySortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type CountrySortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  parentId?: InputMaybe<SortOrder>;
  type?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type CountryTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

/** Returned if the provided coupon code is invalid */
export type CouponCodeExpiredError = ErrorResult & {
  __typename?: 'CouponCodeExpiredError';
  couponCode: Scalars['String']['output'];
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/** Returned if the provided coupon code is invalid */
export type CouponCodeInvalidError = ErrorResult & {
  __typename?: 'CouponCodeInvalidError';
  couponCode: Scalars['String']['output'];
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/** Returned if the provided coupon code is invalid */
export type CouponCodeLimitError = ErrorResult & {
  __typename?: 'CouponCodeLimitError';
  couponCode: Scalars['String']['output'];
  errorCode: ErrorCode;
  limit: Scalars['Int']['output'];
  message: Scalars['String']['output'];
};

/**
 * Input used to create an Address.
 *
 * The countryCode must correspond to a `code` property of a Country that has been defined in the
 * Vendure server. The `code` property is typically a 2-character ISO code such as "GB", "US", "DE" etc.
 * If an invalid code is passed, the mutation will fail.
 */
export type CreateAddressInput = {
  city?: InputMaybe<Scalars['String']['input']>;
  company?: InputMaybe<Scalars['String']['input']>;
  countryCode: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  defaultBillingAddress?: InputMaybe<Scalars['Boolean']['input']>;
  defaultShippingAddress?: InputMaybe<Scalars['Boolean']['input']>;
  fullName?: InputMaybe<Scalars['String']['input']>;
  phoneNumber?: InputMaybe<Scalars['String']['input']>;
  postalCode?: InputMaybe<Scalars['String']['input']>;
  province?: InputMaybe<Scalars['String']['input']>;
  streetLine1: Scalars['String']['input'];
  streetLine2?: InputMaybe<Scalars['String']['input']>;
};

export type CreateAdministratorInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  emailAddress: Scalars['String']['input'];
  firstName: Scalars['String']['input'];
  lastName: Scalars['String']['input'];
  password: Scalars['String']['input'];
  roleIds: Array<Scalars['ID']['input']>;
};

export type CreateAssetInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  file: Scalars['Upload']['input'];
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type CreateAssetResult = Asset | MimeTypeError;

export type CreateChannelInput = {
  availableCurrencyCodes?: InputMaybe<Array<CurrencyCode>>;
  availableLanguageCodes?: InputMaybe<Array<LanguageCode>>;
  code: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  defaultCurrencyCode?: InputMaybe<CurrencyCode>;
  defaultLanguageCode: LanguageCode;
  defaultShippingZoneId: Scalars['ID']['input'];
  defaultTaxZoneId: Scalars['ID']['input'];
  outOfStockThreshold?: InputMaybe<Scalars['Int']['input']>;
  pricesIncludeTax: Scalars['Boolean']['input'];
  sellerId?: InputMaybe<Scalars['ID']['input']>;
  token: Scalars['String']['input'];
  trackInventory?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CreateChannelResult = Channel | LanguageNotAvailableError;

export type CreateCollectionInput = {
  assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
  filters: Array<ConfigurableOperationInput>;
  inheritFilters?: InputMaybe<Scalars['Boolean']['input']>;
  isPrivate?: InputMaybe<Scalars['Boolean']['input']>;
  parentId?: InputMaybe<Scalars['ID']['input']>;
  translations: Array<CreateCollectionTranslationInput>;
};

export type CreateCollectionTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  description: Scalars['String']['input'];
  languageCode: LanguageCode;
  name: Scalars['String']['input'];
  slug: Scalars['String']['input'];
};

export type CreateCountryInput = {
  code: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled: Scalars['Boolean']['input'];
  translations: Array<CountryTranslationInput>;
};

export type CreateCustomerGroupInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  customerIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  name: Scalars['String']['input'];
};

export type CreateCustomerInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  emailAddress: Scalars['String']['input'];
  firstName: Scalars['String']['input'];
  lastName: Scalars['String']['input'];
  phoneNumber?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type CreateCustomerResult = Customer | EmailAddressConflictError;

export type CreateDataHubConnectionInput = {
  code: Scalars['String']['input'];
  config?: InputMaybe<Scalars['JSON']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};

export type CreateDataHubJobInput = {
  code: Scalars['String']['input'];
  definition: Scalars['JSON']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
  type?: InputMaybe<DataHubJobType>;
};

/** Input for creating a new pipeline */
export type CreateDataHubPipelineInput = {
  /** Unique identifier for webhook/API access (lowercase alphanumeric with hyphens) */
  code: Scalars['String']['input'];
  /** Pipeline definition: { version: number, steps: Step[], edges?: Edge[], trigger?: Trigger } */
  definition: Scalars['JSON']['input'];
  /** Whether the pipeline can be triggered (default: true) */
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  /** Human-readable pipeline name */
  name: Scalars['String']['input'];
  /** Schema version for definition format (default: 1) */
  version?: InputMaybe<Scalars['Int']['input']>;
};

export type CreateDataHubSecretInput = {
  code: Scalars['String']['input'];
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  provider?: InputMaybe<Scalars['String']['input']>;
  value?: InputMaybe<Scalars['String']['input']>;
};

export type CreateFacetInput = {
  code: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  isPrivate: Scalars['Boolean']['input'];
  translations: Array<FacetTranslationInput>;
  values?: InputMaybe<Array<CreateFacetValueWithFacetInput>>;
};

export type CreateFacetValueInput = {
  code: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  facetId: Scalars['ID']['input'];
  translations: Array<FacetValueTranslationInput>;
};

export type CreateFacetValueWithFacetInput = {
  code: Scalars['String']['input'];
  translations: Array<FacetValueTranslationInput>;
};

/** Returned if an error is thrown in a FulfillmentHandler's createFulfillment method */
export type CreateFulfillmentError = ErrorResult & {
  __typename?: 'CreateFulfillmentError';
  errorCode: ErrorCode;
  fulfillmentHandlerError: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type CreateGroupOptionInput = {
  code: Scalars['String']['input'];
  translations: Array<ProductOptionGroupTranslationInput>;
};

export type CreatePaymentMethodInput = {
  checker?: InputMaybe<ConfigurableOperationInput>;
  code: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled: Scalars['Boolean']['input'];
  handler: ConfigurableOperationInput;
  translations: Array<PaymentMethodTranslationInput>;
};

export type CreateProductInput = {
  assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  facetValueIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
  translations: Array<ProductTranslationInput>;
};

export type CreateProductOptionGroupInput = {
  code: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  options: Array<CreateGroupOptionInput>;
  translations: Array<ProductOptionGroupTranslationInput>;
};

export type CreateProductOptionInput = {
  code: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  productOptionGroupId: Scalars['ID']['input'];
  translations: Array<ProductOptionGroupTranslationInput>;
};

export type CreateProductVariantInput = {
  assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  facetValueIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
  optionIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  outOfStockThreshold?: InputMaybe<Scalars['Int']['input']>;
  price?: InputMaybe<Scalars['Money']['input']>;
  prices?: InputMaybe<Array<InputMaybe<CreateProductVariantPriceInput>>>;
  productId: Scalars['ID']['input'];
  sku: Scalars['String']['input'];
  stockLevels?: InputMaybe<Array<StockLevelInput>>;
  stockOnHand?: InputMaybe<Scalars['Int']['input']>;
  taxCategoryId?: InputMaybe<Scalars['ID']['input']>;
  trackInventory?: InputMaybe<GlobalFlag>;
  translations: Array<ProductVariantTranslationInput>;
  useGlobalOutOfStockThreshold?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CreateProductVariantOptionInput = {
  code: Scalars['String']['input'];
  optionGroupId: Scalars['ID']['input'];
  translations: Array<ProductOptionTranslationInput>;
};

export type CreateProductVariantPriceInput = {
  currencyCode: CurrencyCode;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  price: Scalars['Money']['input'];
};

export type CreatePromotionInput = {
  actions: Array<ConfigurableOperationInput>;
  conditions: Array<ConfigurableOperationInput>;
  couponCode?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled: Scalars['Boolean']['input'];
  endsAt?: InputMaybe<Scalars['DateTime']['input']>;
  perCustomerUsageLimit?: InputMaybe<Scalars['Int']['input']>;
  startsAt?: InputMaybe<Scalars['DateTime']['input']>;
  translations: Array<PromotionTranslationInput>;
  usageLimit?: InputMaybe<Scalars['Int']['input']>;
};

export type CreatePromotionResult = MissingConditionsError | Promotion;

export type CreateProvinceInput = {
  code: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled: Scalars['Boolean']['input'];
  translations: Array<ProvinceTranslationInput>;
};

export type CreateRoleInput = {
  channelIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  code: Scalars['String']['input'];
  description: Scalars['String']['input'];
  permissions: Array<Permission>;
};

export type CreateSellerInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  name: Scalars['String']['input'];
};

export type CreateShippingMethodInput = {
  calculator: ConfigurableOperationInput;
  checker: ConfigurableOperationInput;
  code: Scalars['String']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  fulfillmentHandler: Scalars['String']['input'];
  translations: Array<ShippingMethodTranslationInput>;
};

export type CreateStockLocationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
};

export type CreateTagInput = {
  value: Scalars['String']['input'];
};

export type CreateTaxCategoryInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  isDefault?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
};

export type CreateTaxRateInput = {
  categoryId: Scalars['ID']['input'];
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  customerGroupId?: InputMaybe<Scalars['ID']['input']>;
  enabled: Scalars['Boolean']['input'];
  name: Scalars['String']['input'];
  value: Scalars['Float']['input'];
  zoneId: Scalars['ID']['input'];
};

export type CreateZoneInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  memberIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  name: Scalars['String']['input'];
};

/**
 * @description
 * ISO 4217 currency code
 *
 * @docsCategory common
 */
export enum CurrencyCode {
  /** United Arab Emirates dirham */
  AED = 'AED',
  /** Afghan afghani */
  AFN = 'AFN',
  /** Albanian lek */
  ALL = 'ALL',
  /** Armenian dram */
  AMD = 'AMD',
  /** Netherlands Antillean guilder */
  ANG = 'ANG',
  /** Angolan kwanza */
  AOA = 'AOA',
  /** Argentine peso */
  ARS = 'ARS',
  /** Australian dollar */
  AUD = 'AUD',
  /** Aruban florin */
  AWG = 'AWG',
  /** Azerbaijani manat */
  AZN = 'AZN',
  /** Bosnia and Herzegovina convertible mark */
  BAM = 'BAM',
  /** Barbados dollar */
  BBD = 'BBD',
  /** Bangladeshi taka */
  BDT = 'BDT',
  /** Bulgarian lev */
  BGN = 'BGN',
  /** Bahraini dinar */
  BHD = 'BHD',
  /** Burundian franc */
  BIF = 'BIF',
  /** Bermudian dollar */
  BMD = 'BMD',
  /** Brunei dollar */
  BND = 'BND',
  /** Boliviano */
  BOB = 'BOB',
  /** Brazilian real */
  BRL = 'BRL',
  /** Bahamian dollar */
  BSD = 'BSD',
  /** Bhutanese ngultrum */
  BTN = 'BTN',
  /** Botswana pula */
  BWP = 'BWP',
  /** Belarusian ruble */
  BYN = 'BYN',
  /** Belize dollar */
  BZD = 'BZD',
  /** Canadian dollar */
  CAD = 'CAD',
  /** Congolese franc */
  CDF = 'CDF',
  /** Swiss franc */
  CHF = 'CHF',
  /** Chilean peso */
  CLP = 'CLP',
  /** Renminbi (Chinese) yuan */
  CNY = 'CNY',
  /** Colombian peso */
  COP = 'COP',
  /** Costa Rican colon */
  CRC = 'CRC',
  /** Cuban convertible peso */
  CUC = 'CUC',
  /** Cuban peso */
  CUP = 'CUP',
  /** Cape Verde escudo */
  CVE = 'CVE',
  /** Czech koruna */
  CZK = 'CZK',
  /** Djiboutian franc */
  DJF = 'DJF',
  /** Danish krone */
  DKK = 'DKK',
  /** Dominican peso */
  DOP = 'DOP',
  /** Algerian dinar */
  DZD = 'DZD',
  /** Egyptian pound */
  EGP = 'EGP',
  /** Eritrean nakfa */
  ERN = 'ERN',
  /** Ethiopian birr */
  ETB = 'ETB',
  /** Euro */
  EUR = 'EUR',
  /** Fiji dollar */
  FJD = 'FJD',
  /** Falkland Islands pound */
  FKP = 'FKP',
  /** Pound sterling */
  GBP = 'GBP',
  /** Georgian lari */
  GEL = 'GEL',
  /** Ghanaian cedi */
  GHS = 'GHS',
  /** Gibraltar pound */
  GIP = 'GIP',
  /** Gambian dalasi */
  GMD = 'GMD',
  /** Guinean franc */
  GNF = 'GNF',
  /** Guatemalan quetzal */
  GTQ = 'GTQ',
  /** Guyanese dollar */
  GYD = 'GYD',
  /** Hong Kong dollar */
  HKD = 'HKD',
  /** Honduran lempira */
  HNL = 'HNL',
  /** Croatian kuna */
  HRK = 'HRK',
  /** Haitian gourde */
  HTG = 'HTG',
  /** Hungarian forint */
  HUF = 'HUF',
  /** Indonesian rupiah */
  IDR = 'IDR',
  /** Israeli new shekel */
  ILS = 'ILS',
  /** Indian rupee */
  INR = 'INR',
  /** Iraqi dinar */
  IQD = 'IQD',
  /** Iranian rial */
  IRR = 'IRR',
  /** Icelandic króna */
  ISK = 'ISK',
  /** Jamaican dollar */
  JMD = 'JMD',
  /** Jordanian dinar */
  JOD = 'JOD',
  /** Japanese yen */
  JPY = 'JPY',
  /** Kenyan shilling */
  KES = 'KES',
  /** Kyrgyzstani som */
  KGS = 'KGS',
  /** Cambodian riel */
  KHR = 'KHR',
  /** Comoro franc */
  KMF = 'KMF',
  /** North Korean won */
  KPW = 'KPW',
  /** South Korean won */
  KRW = 'KRW',
  /** Kuwaiti dinar */
  KWD = 'KWD',
  /** Cayman Islands dollar */
  KYD = 'KYD',
  /** Kazakhstani tenge */
  KZT = 'KZT',
  /** Lao kip */
  LAK = 'LAK',
  /** Lebanese pound */
  LBP = 'LBP',
  /** Sri Lankan rupee */
  LKR = 'LKR',
  /** Liberian dollar */
  LRD = 'LRD',
  /** Lesotho loti */
  LSL = 'LSL',
  /** Libyan dinar */
  LYD = 'LYD',
  /** Moroccan dirham */
  MAD = 'MAD',
  /** Moldovan leu */
  MDL = 'MDL',
  /** Malagasy ariary */
  MGA = 'MGA',
  /** Macedonian denar */
  MKD = 'MKD',
  /** Myanmar kyat */
  MMK = 'MMK',
  /** Mongolian tögrög */
  MNT = 'MNT',
  /** Macanese pataca */
  MOP = 'MOP',
  /** Mauritanian ouguiya */
  MRU = 'MRU',
  /** Mauritian rupee */
  MUR = 'MUR',
  /** Maldivian rufiyaa */
  MVR = 'MVR',
  /** Malawian kwacha */
  MWK = 'MWK',
  /** Mexican peso */
  MXN = 'MXN',
  /** Malaysian ringgit */
  MYR = 'MYR',
  /** Mozambican metical */
  MZN = 'MZN',
  /** Namibian dollar */
  NAD = 'NAD',
  /** Nigerian naira */
  NGN = 'NGN',
  /** Nicaraguan córdoba */
  NIO = 'NIO',
  /** Norwegian krone */
  NOK = 'NOK',
  /** Nepalese rupee */
  NPR = 'NPR',
  /** New Zealand dollar */
  NZD = 'NZD',
  /** Omani rial */
  OMR = 'OMR',
  /** Panamanian balboa */
  PAB = 'PAB',
  /** Peruvian sol */
  PEN = 'PEN',
  /** Papua New Guinean kina */
  PGK = 'PGK',
  /** Philippine peso */
  PHP = 'PHP',
  /** Pakistani rupee */
  PKR = 'PKR',
  /** Polish złoty */
  PLN = 'PLN',
  /** Paraguayan guaraní */
  PYG = 'PYG',
  /** Qatari riyal */
  QAR = 'QAR',
  /** Romanian leu */
  RON = 'RON',
  /** Serbian dinar */
  RSD = 'RSD',
  /** Russian ruble */
  RUB = 'RUB',
  /** Rwandan franc */
  RWF = 'RWF',
  /** Saudi riyal */
  SAR = 'SAR',
  /** Solomon Islands dollar */
  SBD = 'SBD',
  /** Seychelles rupee */
  SCR = 'SCR',
  /** Sudanese pound */
  SDG = 'SDG',
  /** Swedish krona/kronor */
  SEK = 'SEK',
  /** Singapore dollar */
  SGD = 'SGD',
  /** Saint Helena pound */
  SHP = 'SHP',
  /** Sierra Leonean leone */
  SLL = 'SLL',
  /** Somali shilling */
  SOS = 'SOS',
  /** Surinamese dollar */
  SRD = 'SRD',
  /** South Sudanese pound */
  SSP = 'SSP',
  /** São Tomé and Príncipe dobra */
  STN = 'STN',
  /** Salvadoran colón */
  SVC = 'SVC',
  /** Syrian pound */
  SYP = 'SYP',
  /** Swazi lilangeni */
  SZL = 'SZL',
  /** Thai baht */
  THB = 'THB',
  /** Tajikistani somoni */
  TJS = 'TJS',
  /** Turkmenistan manat */
  TMT = 'TMT',
  /** Tunisian dinar */
  TND = 'TND',
  /** Tongan paʻanga */
  TOP = 'TOP',
  /** Turkish lira */
  TRY = 'TRY',
  /** Trinidad and Tobago dollar */
  TTD = 'TTD',
  /** New Taiwan dollar */
  TWD = 'TWD',
  /** Tanzanian shilling */
  TZS = 'TZS',
  /** Ukrainian hryvnia */
  UAH = 'UAH',
  /** Ugandan shilling */
  UGX = 'UGX',
  /** United States dollar */
  USD = 'USD',
  /** Uruguayan peso */
  UYU = 'UYU',
  /** Uzbekistan som */
  UZS = 'UZS',
  /** Venezuelan bolívar soberano */
  VES = 'VES',
  /** Vietnamese đồng */
  VND = 'VND',
  /** Vanuatu vatu */
  VUV = 'VUV',
  /** Samoan tala */
  WST = 'WST',
  /** CFA franc BEAC */
  XAF = 'XAF',
  /** East Caribbean dollar */
  XCD = 'XCD',
  /** CFA franc BCEAO */
  XOF = 'XOF',
  /** CFP franc (franc Pacifique) */
  XPF = 'XPF',
  /** Yemeni rial */
  YER = 'YER',
  /** South African rand */
  ZAR = 'ZAR',
  /** Zambian kwacha */
  ZMW = 'ZMW',
  /** Zimbabwean dollar */
  ZWL = 'ZWL'
}

export type CurrentUser = {
  __typename?: 'CurrentUser';
  channels: Array<CurrentUserChannel>;
  id: Scalars['ID']['output'];
  identifier: Scalars['String']['output'];
};

export type CurrentUserChannel = {
  __typename?: 'CurrentUserChannel';
  code: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  permissions: Array<Permission>;
  token: Scalars['String']['output'];
};

export type CustomField = {
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type CustomFieldConfig = BooleanCustomFieldConfig | DateTimeCustomFieldConfig | FloatCustomFieldConfig | IntCustomFieldConfig | LocaleStringCustomFieldConfig | LocaleTextCustomFieldConfig | RelationCustomFieldConfig | StringCustomFieldConfig | StructCustomFieldConfig | TextCustomFieldConfig;

/**
 * This type is deprecated in v2.2 in favor of the EntityCustomFields type,
 * which allows custom fields to be defined on user-supplied entities.
 */
export type CustomFields = {
  __typename?: 'CustomFields';
  Address: Array<CustomFieldConfig>;
  Administrator: Array<CustomFieldConfig>;
  Asset: Array<CustomFieldConfig>;
  Channel: Array<CustomFieldConfig>;
  Collection: Array<CustomFieldConfig>;
  Customer: Array<CustomFieldConfig>;
  CustomerGroup: Array<CustomFieldConfig>;
  Facet: Array<CustomFieldConfig>;
  FacetValue: Array<CustomFieldConfig>;
  Fulfillment: Array<CustomFieldConfig>;
  GlobalSettings: Array<CustomFieldConfig>;
  HistoryEntry: Array<CustomFieldConfig>;
  Order: Array<CustomFieldConfig>;
  OrderLine: Array<CustomFieldConfig>;
  Payment: Array<CustomFieldConfig>;
  PaymentMethod: Array<CustomFieldConfig>;
  Product: Array<CustomFieldConfig>;
  ProductOption: Array<CustomFieldConfig>;
  ProductOptionGroup: Array<CustomFieldConfig>;
  ProductVariant: Array<CustomFieldConfig>;
  ProductVariantPrice: Array<CustomFieldConfig>;
  Promotion: Array<CustomFieldConfig>;
  Refund: Array<CustomFieldConfig>;
  Region: Array<CustomFieldConfig>;
  Seller: Array<CustomFieldConfig>;
  Session: Array<CustomFieldConfig>;
  ShippingLine: Array<CustomFieldConfig>;
  ShippingMethod: Array<CustomFieldConfig>;
  StockLevel: Array<CustomFieldConfig>;
  StockLocation: Array<CustomFieldConfig>;
  StockMovement: Array<CustomFieldConfig>;
  TaxCategory: Array<CustomFieldConfig>;
  TaxRate: Array<CustomFieldConfig>;
  User: Array<CustomFieldConfig>;
  Zone: Array<CustomFieldConfig>;
};

export type Customer = Node & {
  __typename?: 'Customer';
  addresses?: Maybe<Array<Address>>;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  emailAddress: Scalars['String']['output'];
  firstName: Scalars['String']['output'];
  groups: Array<CustomerGroup>;
  history: HistoryEntryList;
  id: Scalars['ID']['output'];
  lastName: Scalars['String']['output'];
  orders: OrderList;
  phoneNumber?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
  user?: Maybe<User>;
};


export type CustomerHistoryArgs = {
  options?: InputMaybe<HistoryEntryListOptions>;
};


export type CustomerOrdersArgs = {
  options?: InputMaybe<OrderListOptions>;
};

export type CustomerFilterParameter = {
  _and?: InputMaybe<Array<CustomerFilterParameter>>;
  _or?: InputMaybe<Array<CustomerFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  emailAddress?: InputMaybe<StringOperators>;
  firstName?: InputMaybe<StringOperators>;
  id?: InputMaybe<IdOperators>;
  lastName?: InputMaybe<StringOperators>;
  phoneNumber?: InputMaybe<StringOperators>;
  postalCode?: InputMaybe<StringOperators>;
  title?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type CustomerGroup = Node & {
  __typename?: 'CustomerGroup';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  customers: CustomerList;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};


export type CustomerGroupCustomersArgs = {
  options?: InputMaybe<CustomerListOptions>;
};

export type CustomerGroupFilterParameter = {
  _and?: InputMaybe<Array<CustomerGroupFilterParameter>>;
  _or?: InputMaybe<Array<CustomerGroupFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type CustomerGroupList = PaginatedList & {
  __typename?: 'CustomerGroupList';
  items: Array<CustomerGroup>;
  totalItems: Scalars['Int']['output'];
};

export type CustomerGroupListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<CustomerGroupFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<CustomerGroupSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type CustomerGroupSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type CustomerList = PaginatedList & {
  __typename?: 'CustomerList';
  items: Array<Customer>;
  totalItems: Scalars['Int']['output'];
};

export type CustomerListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<CustomerFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<CustomerSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type CustomerSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  emailAddress?: InputMaybe<SortOrder>;
  firstName?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lastName?: InputMaybe<SortOrder>;
  phoneNumber?: InputMaybe<SortOrder>;
  title?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type DashboardMetricSummary = {
  __typename?: 'DashboardMetricSummary';
  entries: Array<DashboardMetricSummaryEntry>;
  title: Scalars['String']['output'];
  type: DashboardMetricType;
};

export type DashboardMetricSummaryEntry = {
  __typename?: 'DashboardMetricSummaryEntry';
  label: Scalars['String']['output'];
  value: Scalars['Float']['output'];
};

export type DashboardMetricSummaryInput = {
  endDate: Scalars['DateTime']['input'];
  refresh?: InputMaybe<Scalars['Boolean']['input']>;
  startDate: Scalars['DateTime']['input'];
  types: Array<DashboardMetricType>;
};

export enum DashboardMetricType {
  AverageOrderValue = 'AverageOrderValue',
  OrderCount = 'OrderCount',
  OrderTotal = 'OrderTotal'
}

export type DataHubAdapter = {
  __typename?: 'DataHubAdapter';
  async?: Maybe<Scalars['Boolean']['output']>;
  batchable?: Maybe<Scalars['Boolean']['output']>;
  builtIn?: Maybe<Scalars['Boolean']['output']>;
  category?: Maybe<Scalars['String']['output']>;
  categoryLabel?: Maybe<Scalars['String']['output']>;
  categoryOrder?: Maybe<Scalars['Int']['output']>;
  code: Scalars['String']['output'];
  color?: Maybe<Scalars['String']['output']>;
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecatedMessage?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  editorType?: Maybe<Scalars['String']['output']>;
  entityType?: Maybe<Scalars['String']['output']>;
  formatType?: Maybe<Scalars['String']['output']>;
  icon?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  patchableFields?: Maybe<Array<Scalars['String']['output']>>;
  pure?: Maybe<Scalars['Boolean']['output']>;
  requires?: Maybe<Array<Scalars['String']['output']>>;
  schema: DataHubStepConfigSchema;
  summaryTemplate?: Maybe<Scalars['String']['output']>;
  type: Scalars['String']['output'];
  version?: Maybe<Scalars['String']['output']>;
  wizardHidden?: Maybe<Scalars['Boolean']['output']>;
};

export type DataHubAdapterCodeMapping = {
  __typename?: 'DataHubAdapterCodeMapping';
  adapterCode: Scalars['String']['output'];
  label: Scalars['String']['output'];
  value: Scalars['String']['output'];
};

/** Analytics API - Stats and metrics */
export type DataHubAnalyticsOverview = {
  __typename?: 'DataHubAnalyticsOverview';
  activeJobs: Scalars['Int']['output'];
  activePipelines: Scalars['Int']['output'];
  avgDurationMsToday: Scalars['Float']['output'];
  recordsFailedToday: Scalars['Int']['output'];
  recordsProcessedToday: Scalars['Int']['output'];
  runsThisWeek: Scalars['Int']['output'];
  runsToday: Scalars['Int']['output'];
  successRateToday: Scalars['Float']['output'];
  successRateWeek: Scalars['Float']['output'];
  totalJobs: Scalars['Int']['output'];
  totalPipelines: Scalars['Int']['output'];
};

export type DataHubAutoMapperConfig = {
  __typename?: 'DataHubAutoMapperConfig';
  /** Case-sensitive field name matching */
  caseSensitive: Scalars['Boolean']['output'];
  /** Minimum confidence score to suggest a mapping (0-1) */
  confidenceThreshold: Scalars['Float']['output'];
  /** User-defined field name aliases */
  customAliases: Scalars['JSON']['output'];
  /** Enable fuzzy/approximate string matching for field names */
  enableFuzzyMatching: Scalars['Boolean']['output'];
  /** Enable automatic type inference from sample data */
  enableTypeInference: Scalars['Boolean']['output'];
  /** Fields to exclude from auto-mapping suggestions */
  excludeFields: Array<Scalars['String']['output']>;
  /** Scoring weights for field matching */
  weights: DataHubAutoMapperScoringWeights;
};

export type DataHubAutoMapperConfigInput = {
  /** Case-sensitive field name matching */
  caseSensitive?: InputMaybe<Scalars['Boolean']['input']>;
  /** Minimum confidence score to suggest a mapping (0-1) */
  confidenceThreshold?: InputMaybe<Scalars['Float']['input']>;
  /** User-defined field name aliases (JSON object with canonical field names as keys) */
  customAliases?: InputMaybe<Scalars['JSON']['input']>;
  /** Enable fuzzy/approximate string matching for field names */
  enableFuzzyMatching?: InputMaybe<Scalars['Boolean']['input']>;
  /** Enable automatic type inference from sample data */
  enableTypeInference?: InputMaybe<Scalars['Boolean']['input']>;
  /** Fields to exclude from auto-mapping suggestions */
  excludeFields?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Optional: Pipeline ID to associate this config with (null for global) */
  pipelineId?: InputMaybe<Scalars['ID']['input']>;
  /** Scoring weights for field matching */
  weights?: InputMaybe<DataHubAutoMapperScoringWeightsInput>;
};

export type DataHubAutoMapperConfigValidation = {
  __typename?: 'DataHubAutoMapperConfigValidation';
  errors: Array<Scalars['String']['output']>;
  valid: Scalars['Boolean']['output'];
  warnings: Array<Scalars['String']['output']>;
};

/** AutoMapper Configuration API - Configure auto-mapping behavior */
export type DataHubAutoMapperScoringWeights = {
  __typename?: 'DataHubAutoMapperScoringWeights';
  /** Weight for description matching (0-1) */
  descriptionMatch: Scalars['Float']['output'];
  /** Weight for field name similarity (0-1) */
  nameSimilarity: Scalars['Float']['output'];
  /** Weight for type compatibility (0-1) */
  typeCompatibility: Scalars['Float']['output'];
};

export type DataHubAutoMapperScoringWeightsInput = {
  descriptionMatch?: InputMaybe<Scalars['Float']['input']>;
  nameSimilarity?: InputMaybe<Scalars['Float']['input']>;
  typeCompatibility?: InputMaybe<Scalars['Float']['input']>;
};

/** Persistent checkpoint for resumable pipeline execution */
export type DataHubCheckpoint = Node & {
  __typename?: 'DataHubCheckpoint';
  createdAt: Scalars['DateTime']['output'];
  /** Checkpoint state data: { cursor, lastId, processedCount, customState } */
  data: Scalars['JSON']['output'];
  id: Scalars['ID']['output'];
  pipeline: DataHubPipeline;
  updatedAt: Scalars['DateTime']['output'];
};

export type DataHubComparisonOperator = {
  __typename?: 'DataHubComparisonOperator';
  description?: Maybe<Scalars['String']['output']>;
  /** Example value hint (e.g. regex pattern, JSON array literal) */
  example?: Maybe<Scalars['String']['output']>;
  label: Scalars['String']['output'];
  noValue?: Maybe<Scalars['Boolean']['output']>;
  value: Scalars['String']['output'];
  valueType?: Maybe<Scalars['String']['output']>;
};

export enum DataHubConfidenceLevel {
  HIGH = 'HIGH',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM'
}

export type DataHubConfigFieldGroup = {
  __typename?: 'DataHubConfigFieldGroup';
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  label: Scalars['String']['output'];
};

export type DataHubConfigOptions = {
  __typename?: 'DataHubConfigOptions';
  /** Message acknowledgment mode options for queue consumers */
  ackModes: Array<DataHubOptionValue>;
  /** Adapter type metadata for the adapters page tabs */
  adapterTypes: Array<DataHubOptionValue>;
  approvalTypes: Array<DataHubTypedOptionValue>;
  authTypes: Array<DataHubOptionValue>;
  backoffStrategies: Array<DataHubOptionValue>;
  checkpointStrategies: Array<DataHubOptionValue>;
  cleanupStrategies: Array<DataHubOptionValue>;
  comparisonOperators: Array<DataHubComparisonOperator>;
  compressionTypes: Array<DataHubOptionValue>;
  conflictStrategies: Array<DataHubOptionValue>;
  connectionSchemas: Array<DataHubConnectionSchema>;
  /** Cron schedule presets for quick schedule trigger configuration */
  cronPresets: Array<DataHubOptionValue>;
  csvDelimiters: Array<DataHubOptionValue>;
  destinationSchemas: Array<DataHubDestinationSchema>;
  destinationTypes: Array<DataHubOptionValue>;
  enrichmentSourceTypes: Array<DataHubTypedOptionValue>;
  exportAdapterCodes: Array<DataHubAdapterCodeMapping>;
  feedAdapterCodes: Array<DataHubAdapterCodeMapping>;
  /** Operator codes suitable for field-level transforms in the export wizard */
  fieldTransformTypes: Array<DataHubOptionValue>;
  fileEncodings: Array<DataHubOptionValue>;
  fileFormats: Array<DataHubOptionValue>;
  hookStageCategories: Array<DataHubHookStageCategory>;
  hookStages: Array<DataHubHookStage>;
  httpMethods: Array<DataHubOptionValue>;
  loadStrategies: Array<DataHubOptionValue>;
  logLevels: Array<DataHubOptionValue>;
  logPersistenceLevels: Array<DataHubOptionValue>;
  newRecordStrategies: Array<DataHubOptionValue>;
  parallelErrorPolicies: Array<DataHubOptionValue>;
  /** Export query type options for the source step */
  queryTypeOptions: Array<DataHubOptionValue>;
  queueTypes: Array<DataHubOptionValue>;
  runModes: Array<DataHubOptionValue>;
  /** Run status options for filter dropdowns */
  runStatuses: Array<DataHubOptionValue>;
  stepTypes: Array<DataHubStepTypeConfig>;
  triggerTypes: Array<DataHubTypedOptionValue>;
  validationModes: Array<DataHubOptionValue>;
  validationRuleTypes: Array<DataHubTypedOptionValue>;
  vendureEvents: Array<DataHubOptionValue>;
  /** Wizard strategy mappings: existingRecords wizard value to backend load/conflict strategies */
  wizardStrategyMappings: Array<DataHubWizardStrategyMapping>;
};

export type DataHubConnection = Node & {
  __typename?: 'DataHubConnection';
  code: Scalars['String']['output'];
  config: Scalars['JSON']['output'];
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  type: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type DataHubConnectionFilterParameter = {
  _and?: InputMaybe<Array<DataHubConnectionFilterParameter>>;
  _or?: InputMaybe<Array<DataHubConnectionFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  type?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type DataHubConnectionList = PaginatedList & {
  __typename?: 'DataHubConnectionList';
  items: Array<DataHubConnection>;
  totalItems: Scalars['Int']['output'];
};

export type DataHubConnectionListOptions = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  filterOperator?: InputMaybe<LogicalOperator>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type DataHubConnectionSchema = {
  __typename?: 'DataHubConnectionSchema';
  fields: Array<DataHubConnectionSchemaField>;
  /** True for HTTP-like connection types that use the dedicated HTTP editor with auth/headers support */
  httpLike?: Maybe<Scalars['Boolean']['output']>;
  label: Scalars['String']['output'];
  type: Scalars['String']['output'];
};

export type DataHubConnectionSchemaField = {
  __typename?: 'DataHubConnectionSchemaField';
  defaultValue?: Maybe<Scalars['JSON']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  key: Scalars['String']['output'];
  label: Scalars['String']['output'];
  options?: Maybe<Array<DataHubOption>>;
  /** Reference to a dynamic option list served by configOptions (e.g. authTypes, queueTypes, vendureEvents) */
  optionsRef?: Maybe<Scalars['String']['output']>;
  placeholder?: Maybe<Scalars['String']['output']>;
  required?: Maybe<Scalars['Boolean']['output']>;
  type: Scalars['String']['output'];
};

export type DataHubConnectionSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  type?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

/** Message consumer status for queue-triggered pipelines */
export type DataHubConsumerStatus = {
  __typename?: 'DataHubConsumerStatus';
  isActive: Scalars['Boolean']['output'];
  lastMessageAt?: Maybe<Scalars['DateTime']['output']>;
  messagesFailed: Scalars['Int']['output'];
  messagesProcessed: Scalars['Int']['output'];
  pipelineCode: Scalars['String']['output'];
  queueName: Scalars['String']['output'];
};

export type DataHubDeadLetterResult = {
  __typename?: 'DataHubDeadLetterResult';
  success: Scalars['Boolean']['output'];
};

export type DataHubDeliveryResult = {
  __typename?: 'DataHubDeliveryResult';
  deliveredAt?: Maybe<Scalars['DateTime']['output']>;
  destinationId: Scalars['String']['output'];
  destinationType: DataHubDestinationType;
  error?: Maybe<Scalars['String']['output']>;
  filename: Scalars['String']['output'];
  location?: Maybe<Scalars['String']['output']>;
  metadata?: Maybe<Scalars['JSON']['output']>;
  size: Scalars['Int']['output'];
  success: Scalars['Boolean']['output'];
};

export type DataHubDestinationSchema = {
  __typename?: 'DataHubDestinationSchema';
  /** Key in the wizard destination state object (e.g. sftpConfig, s3Config) */
  configKey: Scalars['String']['output'];
  /** Maps wizard field names to pipeline config field names (JSON object, e.g. { directory: path }) */
  fieldMapping?: Maybe<Scalars['JSON']['output']>;
  /** Field definitions for the destination configuration form */
  fields: Array<DataHubConnectionSchemaField>;
  /** Human-readable label */
  label: Scalars['String']['output'];
  /** Informational message for destination types with no configurable fields */
  message?: Maybe<Scalars['String']['output']>;
  /** Destination type key (e.g. SFTP, S3, HTTP) */
  type: Scalars['String']['output'];
};

export type DataHubDestinationTestResult = {
  __typename?: 'DataHubDestinationTestResult';
  latencyMs?: Maybe<Scalars['Int']['output']>;
  message: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
};

/** Export Destinations API - S3, SFTP, HTTP, etc. */
export enum DataHubDestinationType {
  DOWNLOAD = 'DOWNLOAD',
  EMAIL = 'EMAIL',
  FTP = 'FTP',
  GCS = 'GCS',
  HTTP = 'HTTP',
  LOCAL = 'LOCAL',
  S3 = 'S3',
  SFTP = 'SFTP'
}

/** Diff entry showing a single change between revisions */
export type DataHubDiffEntry = {
  __typename?: 'DataHubDiffEntry';
  /** Value after the change */
  after?: Maybe<Scalars['JSON']['output']>;
  /** Value before the change */
  before?: Maybe<Scalars['JSON']['output']>;
  /** Human-readable label */
  label: Scalars['String']['output'];
  /** JSON path to the changed element */
  path: Scalars['String']['output'];
  /** Type of element changed */
  type: DataHubDiffType;
};

export enum DataHubDiffType {
  CONFIG = 'CONFIG',
  EDGE = 'EDGE',
  HOOK = 'HOOK',
  META = 'META',
  STEP = 'STEP',
  TRIGGER = 'TRIGGER'
}

export type DataHubDryRunError = {
  __typename?: 'DataHubDryRunError';
  field: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type DataHubDryRunRecord = {
  __typename?: 'DataHubDryRunRecord';
  data: Scalars['JSON']['output'];
  errors: Array<DataHubDryRunError>;
  success: Scalars['Boolean']['output'];
};

/** Result of a dry run execution */
export type DataHubDryRunResult = {
  __typename?: 'DataHubDryRunResult';
  /** Execution metrics: { recordsProcessed, duration, stepMetrics } */
  metrics: Scalars['JSON']['output'];
  /** Informational notes about the dry run */
  notes: Array<Scalars['String']['output']>;
  /** Sample records showing transformation at each step */
  sampleRecords?: Maybe<Array<DataHubDryRunSampleRecord>>;
};

/** Sample record transformation for dry run preview */
export type DataHubDryRunSampleRecord = {
  __typename?: 'DataHubDryRunSampleRecord';
  /** Record state after this step */
  after: Scalars['JSON']['output'];
  /** Record state before this step */
  before: Scalars['JSON']['output'];
  /** Step key where transformation occurred */
  step: Scalars['String']['output'];
};

export type DataHubDryRunSummary = {
  __typename?: 'DataHubDryRunSummary';
  failed: Scalars['Int']['output'];
  success: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

/** Duration estimate with confidence */
export type DataHubDurationEstimate = {
  __typename?: 'DataHubDurationEstimate';
  basedOn: DataHubEstimateBasis;
  confidence: DataHubConfidenceLevel;
  estimatedMs: Scalars['Int']['output'];
  extractMs: Scalars['Int']['output'];
  loadMs: Scalars['Int']['output'];
  transformMs: Scalars['Int']['output'];
};

export type DataHubEntityField = {
  __typename?: 'DataHubEntityField';
  default?: Maybe<Scalars['JSON']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  indexed: Scalars['Boolean']['output'];
  key: Scalars['String']['output'];
  readonly: Scalars['Boolean']['output'];
  relation?: Maybe<DataHubRelationInfo>;
  required: Scalars['Boolean']['output'];
  type: Scalars['String']['output'];
  unique: Scalars['Boolean']['output'];
};

/** Impact breakdown for a specific entity type */
export type DataHubEntityImpact = {
  __typename?: 'DataHubEntityImpact';
  entityType: Scalars['String']['output'];
  fieldChanges: Array<DataHubFieldChangePreview>;
  operations: DataHubEntityOperations;
  sampleRecordIds: Array<Scalars['String']['output']>;
};

/** Operations breakdown for an entity type */
export type DataHubEntityOperations = {
  __typename?: 'DataHubEntityOperations';
  create: Scalars['Int']['output'];
  delete: Scalars['Int']['output'];
  error: Scalars['Int']['output'];
  skip: Scalars['Int']['output'];
  update: Scalars['Int']['output'];
};

export type DataHubErrorAnalytics = {
  __typename?: 'DataHubErrorAnalytics';
  errorTrend: Array<DataHubTimeSeries>;
  errorsByPipeline: Array<DataHubPipelineErrorCount>;
  errorsByStep: Array<DataHubStepErrorCount>;
  topErrors: Array<DataHubTopError>;
  totalErrors: Scalars['Int']['output'];
};

export enum DataHubEstimateBasis {
  ESTIMATE = 'ESTIMATE',
  HISTORICAL = 'HISTORICAL',
  SAMPLING = 'SAMPLING'
}

export type DataHubEvent = {
  __typename?: 'DataHubEvent';
  createdAt: Scalars['DateTime']['output'];
  name: Scalars['String']['output'];
  payload?: Maybe<Scalars['JSON']['output']>;
};

export type DataHubExportDestination = {
  __typename?: 'DataHubExportDestination';
  authType?: Maybe<Scalars['String']['output']>;
  bucket?: Maybe<Scalars['String']['output']>;
  directory?: Maybe<Scalars['String']['output']>;
  enabled: Scalars['Boolean']['output'];
  endpoint?: Maybe<Scalars['String']['output']>;
  host?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  method?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  port?: Maybe<Scalars['Int']['output']>;
  prefix?: Maybe<Scalars['String']['output']>;
  region?: Maybe<Scalars['String']['output']>;
  remotePath?: Maybe<Scalars['String']['output']>;
  subject?: Maybe<Scalars['String']['output']>;
  to?: Maybe<Array<Scalars['String']['output']>>;
  type: DataHubDestinationType;
  url?: Maybe<Scalars['String']['output']>;
  username?: Maybe<Scalars['String']['output']>;
};

export type DataHubExportDestinationInput = {
  accessKeyId?: InputMaybe<Scalars['String']['input']>;
  acl?: InputMaybe<Scalars['String']['input']>;
  authConfig?: InputMaybe<Scalars['JSON']['input']>;
  authType?: InputMaybe<Scalars['String']['input']>;
  body?: InputMaybe<Scalars['String']['input']>;
  bucket?: InputMaybe<Scalars['String']['input']>;
  cc?: InputMaybe<Array<Scalars['String']['input']>>;
  directory?: InputMaybe<Scalars['String']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  endpoint?: InputMaybe<Scalars['String']['input']>;
  headers?: InputMaybe<Scalars['JSON']['input']>;
  host?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['String']['input'];
  method?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  password?: InputMaybe<Scalars['String']['input']>;
  port?: InputMaybe<Scalars['Int']['input']>;
  prefix?: InputMaybe<Scalars['String']['input']>;
  privateKey?: InputMaybe<Scalars['String']['input']>;
  region?: InputMaybe<Scalars['String']['input']>;
  remotePath?: InputMaybe<Scalars['String']['input']>;
  secretAccessKey?: InputMaybe<Scalars['String']['input']>;
  secure?: InputMaybe<Scalars['Boolean']['input']>;
  subject?: InputMaybe<Scalars['String']['input']>;
  to?: InputMaybe<Array<Scalars['String']['input']>>;
  type: DataHubDestinationType;
  url?: InputMaybe<Scalars['String']['input']>;
  username?: InputMaybe<Scalars['String']['input']>;
};

/** Export template (built-in or custom) for the export wizard */
export type DataHubExportTemplate = {
  __typename?: 'DataHubExportTemplate';
  definition?: Maybe<Scalars['JSON']['output']>;
  description: Scalars['String']['output'];
  format: Scalars['String']['output'];
  icon?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
  requiredFields?: Maybe<Array<Scalars['String']['output']>>;
  tags?: Maybe<Array<Scalars['String']['output']>>;
};

export type DataHubExtractor = {
  __typename?: 'DataHubExtractor';
  category: DataHubExtractorCategory;
  code: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  icon?: Maybe<Scalars['String']['output']>;
  isBatch: Scalars['Boolean']['output'];
  isStreaming: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  schema: DataHubExtractorConfigSchema;
  supportsCancellation: Scalars['Boolean']['output'];
  supportsIncremental: Scalars['Boolean']['output'];
  supportsPagination: Scalars['Boolean']['output'];
  version?: Maybe<Scalars['String']['output']>;
};

/** Extractor API - List and inspect data extractors */
export enum DataHubExtractorCategory {
  API = 'API',
  CLOUD_STORAGE = 'CLOUD_STORAGE',
  CUSTOM = 'CUSTOM',
  DATABASE = 'DATABASE',
  DATA_SOURCE = 'DATA_SOURCE',
  FILE_SYSTEM = 'FILE_SYSTEM',
  VENDURE = 'VENDURE',
  WEBHOOK = 'WEBHOOK'
}

export type DataHubExtractorConfigField = {
  __typename?: 'DataHubExtractorConfigField';
  defaultValue?: Maybe<Scalars['JSON']['output']>;
  dependsOn?: Maybe<DataHubFieldDependency>;
  description?: Maybe<Scalars['String']['output']>;
  group?: Maybe<Scalars['String']['output']>;
  key: Scalars['String']['output'];
  label: Scalars['String']['output'];
  options?: Maybe<Array<DataHubOption>>;
  placeholder?: Maybe<Scalars['String']['output']>;
  required?: Maybe<Scalars['Boolean']['output']>;
  type: Scalars['String']['output'];
};

export type DataHubExtractorConfigGroup = {
  __typename?: 'DataHubExtractorConfigGroup';
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  label: Scalars['String']['output'];
};

export type DataHubExtractorConfigSchema = {
  __typename?: 'DataHubExtractorConfigSchema';
  fields: Array<DataHubExtractorConfigField>;
  groups?: Maybe<Array<DataHubExtractorConfigGroup>>;
};

export type DataHubExtractorsByCategory = {
  __typename?: 'DataHubExtractorsByCategory';
  category: DataHubExtractorCategory;
  extractors: Array<DataHubExtractor>;
  label: Scalars['String']['output'];
};

/** Feeds API - Export feeds for Google Shopping, Facebook, etc. */
export type DataHubFeed = Node & {
  __typename?: 'DataHubFeed';
  channelToken?: Maybe<Scalars['String']['output']>;
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  fieldMappings?: Maybe<Scalars['JSON']['output']>;
  filters?: Maybe<Scalars['JSON']['output']>;
  format: DataHubFeedFormat;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  options?: Maybe<Scalars['JSON']['output']>;
  schedule?: Maybe<DataHubFeedSchedule>;
  updatedAt: Scalars['DateTime']['output'];
};

export enum DataHubFeedFormat {
  AMAZON = 'AMAZON',
  BING_SHOPPING = 'BING_SHOPPING',
  CSV = 'CSV',
  CUSTOM = 'CUSTOM',
  GOOGLE_SHOPPING = 'GOOGLE_SHOPPING',
  JSON = 'JSON',
  META_CATALOG = 'META_CATALOG',
  PINTEREST = 'PINTEREST',
  TIKTOK = 'TIKTOK',
  XML = 'XML'
}

export type DataHubFeedFormatInfo = {
  __typename?: 'DataHubFeedFormatInfo';
  code: Scalars['String']['output'];
  description: Scalars['String']['output'];
  label: Scalars['String']['output'];
};

export type DataHubFeedGenerationResult = {
  __typename?: 'DataHubFeedGenerationResult';
  downloadUrl?: Maybe<Scalars['String']['output']>;
  errors: Array<Scalars['String']['output']>;
  generatedAt: Scalars['DateTime']['output'];
  itemCount: Scalars['Int']['output'];
  success: Scalars['Boolean']['output'];
  warnings: Array<Scalars['String']['output']>;
};

export type DataHubFeedInput = {
  channelToken?: InputMaybe<Scalars['String']['input']>;
  code: Scalars['String']['input'];
  fieldMappings?: InputMaybe<Scalars['JSON']['input']>;
  filters?: InputMaybe<Scalars['JSON']['input']>;
  format: DataHubFeedFormat;
  name: Scalars['String']['input'];
  options?: InputMaybe<Scalars['JSON']['input']>;
  schedule?: InputMaybe<DataHubFeedScheduleInput>;
};

export type DataHubFeedPreview = {
  __typename?: 'DataHubFeedPreview';
  content: Scalars['String']['output'];
  contentType: Scalars['String']['output'];
  itemCount: Scalars['Int']['output'];
};

export type DataHubFeedSchedule = {
  __typename?: 'DataHubFeedSchedule';
  cron: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
};

export type DataHubFeedScheduleInput = {
  cron: Scalars['String']['input'];
  enabled: Scalars['Boolean']['input'];
};

/** Field change preview */
export type DataHubFieldChangePreview = {
  __typename?: 'DataHubFieldChangePreview';
  affectedCount: Scalars['Int']['output'];
  changeType: DataHubFieldChangeType;
  field: Scalars['String']['output'];
  sampleAfter: Array<Scalars['JSON']['output']>;
  sampleBefore: Array<Scalars['JSON']['output']>;
};

export enum DataHubFieldChangeType {
  REMOVE = 'REMOVE',
  SET = 'SET',
  TRANSFORM = 'TRANSFORM',
  UPDATE = 'UPDATE'
}

export type DataHubFieldDependency = {
  __typename?: 'DataHubFieldDependency';
  field: Scalars['String']['output'];
  operator?: Maybe<Scalars['String']['output']>;
  value: Scalars['JSON']['output'];
};

export type DataHubFieldSuggestion = {
  __typename?: 'DataHubFieldSuggestion';
  confidence: Scalars['String']['output'];
  reason: Scalars['String']['output'];
  score: Scalars['Int']['output'];
  source: Scalars['String']['output'];
  suggestedTransforms?: Maybe<Scalars['JSON']['output']>;
  target: Scalars['String']['output'];
};

export type DataHubFieldValidation = {
  __typename?: 'DataHubFieldValidation';
  max?: Maybe<Scalars['Float']['output']>;
  maxLength?: Maybe<Scalars['Int']['output']>;
  min?: Maybe<Scalars['Float']['output']>;
  minLength?: Maybe<Scalars['Int']['output']>;
  pattern?: Maybe<Scalars['String']['output']>;
  patternMessage?: Maybe<Scalars['String']['output']>;
};

export type DataHubFilePreview = {
  __typename?: 'DataHubFilePreview';
  fields: Array<DataHubPreviewField>;
  format: Scalars['String']['output'];
  sampleData: Scalars['JSON']['output'];
  success: Scalars['Boolean']['output'];
  suggestedMappings?: Maybe<Array<DataHubFieldSuggestion>>;
  totalRows: Scalars['Int']['output'];
  warnings: Array<Scalars['String']['output']>;
};

export type DataHubFileUploadInput = {
  content: Scalars['String']['input'];
  delimiter?: InputMaybe<Scalars['String']['input']>;
  filename: Scalars['String']['input'];
  format?: InputMaybe<Scalars['String']['input']>;
  headerRow?: InputMaybe<Scalars['Boolean']['input']>;
  sheet?: InputMaybe<Scalars['String']['input']>;
};

/** Result of format conversion operation */
export type DataHubFormatConversionResult = {
  __typename?: 'DataHubFormatConversionResult';
  /** The converted definition in the target format */
  definition: Scalars['JSON']['output'];
  /** Any issues encountered during conversion */
  issues: Array<Scalars['String']['output']>;
  /** Whether the conversion was successful */
  success: Scalars['Boolean']['output'];
};

/** Result of a gate approval or rejection action */
export type DataHubGateActionResult = {
  __typename?: 'DataHubGateActionResult';
  /** Error message if the action failed */
  message?: Maybe<Scalars['String']['output']>;
  /** The updated pipeline run after the gate action */
  run?: Maybe<DataHubPipelineRun>;
  /** Whether the action was successful */
  success: Scalars['Boolean']['output'];
};

export type DataHubHookStage = {
  __typename?: 'DataHubHookStage';
  /** Category for grouping (lifecycle, data, error) */
  category: Scalars['String']['output'];
  /** Description of when this hook stage fires */
  description: Scalars['String']['output'];
  /** Lucide icon name (kebab-case) for UI display */
  icon: Scalars['String']['output'];
  /** Hook stage key (e.g. PIPELINE_STARTED, BEFORE_EXTRACT) */
  key: Scalars['String']['output'];
  /** Human-readable label */
  label: Scalars['String']['output'];
};

export type DataHubHookStageCategory = {
  __typename?: 'DataHubHookStageCategory';
  /** CSS color classes for the category badge */
  color: Scalars['String']['output'];
  /** Description of this category */
  description: Scalars['String']['output'];
  /** CSS grid class for layout (e.g. grid-cols-3) */
  gridClass: Scalars['String']['output'];
  /** Category key (e.g. lifecycle, data, error) */
  key: Scalars['String']['output'];
  /** Human-readable label */
  label: Scalars['String']['output'];
  /** Display order (lower = first) */
  order: Scalars['Int']['output'];
};

/** Complete impact analysis result */
export type DataHubImpactAnalysis = {
  __typename?: 'DataHubImpactAnalysis';
  analyzedAt: Scalars['DateTime']['output'];
  entityBreakdown: Array<DataHubEntityImpact>;
  estimatedDuration: DataHubDurationEstimate;
  fullDatasetSize?: Maybe<Scalars['Int']['output']>;
  resourceUsage: DataHubResourceEstimate;
  riskAssessment: DataHubRiskAssessment;
  sampleRecords: Array<DataHubSampleRecordFlow>;
  sampleSize: Scalars['Int']['output'];
  summary: DataHubImpactSummary;
};

export type DataHubImpactAnalysisOptions = {
  /** Include field-level changes (default: true) */
  includeFieldChanges?: InputMaybe<Scalars['Boolean']['input']>;
  /** Include resource estimates (default: true) */
  includeResourceEstimate?: InputMaybe<Scalars['Boolean']['input']>;
  /** Maximum duration for analysis in ms (default: 60000) */
  maxDurationMs?: InputMaybe<Scalars['Int']['input']>;
  /** Number of records to sample (default: 100) */
  sampleSize?: InputMaybe<Scalars['Int']['input']>;
};

/** Overall impact summary */
export type DataHubImpactSummary = {
  __typename?: 'DataHubImpactSummary';
  affectedEntities: Array<Scalars['String']['output']>;
  estimatedFailureCount: Scalars['Int']['output'];
  estimatedSkipCount: Scalars['Int']['output'];
  estimatedSuccessCount: Scalars['Int']['output'];
  totalRecordsToProcess: Scalars['Int']['output'];
};

/** Import template (built-in or custom) for the import wizard */
export type DataHubImportTemplate = {
  __typename?: 'DataHubImportTemplate';
  category: Scalars['String']['output'];
  definition?: Maybe<Scalars['JSON']['output']>;
  description: Scalars['String']['output'];
  featured?: Maybe<Scalars['Boolean']['output']>;
  formats?: Maybe<Array<Scalars['String']['output']>>;
  icon?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
  optionalFields?: Maybe<Array<Scalars['String']['output']>>;
  requiredFields: Array<Scalars['String']['output']>;
  sampleData?: Maybe<Scalars['JSON']['output']>;
  tags?: Maybe<Array<Scalars['String']['output']>>;
};

export type DataHubJob = Node & {
  __typename?: 'DataHubJob';
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  createdByUserId?: Maybe<Scalars['String']['output']>;
  definition: Scalars['JSON']['output'];
  description?: Maybe<Scalars['String']['output']>;
  enabled: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  lastRunAt?: Maybe<Scalars['DateTime']['output']>;
  lastRunStatus?: Maybe<DataHubJobRunStatus>;
  name: Scalars['String']['output'];
  publishedAt?: Maybe<Scalars['DateTime']['output']>;
  publishedByUserId?: Maybe<Scalars['String']['output']>;
  runCount: Scalars['Int']['output'];
  status: DataHubJobStatus;
  tags?: Maybe<Array<Scalars['String']['output']>>;
  totalRecordsFailed: Scalars['Int']['output'];
  totalRecordsProcessed: Scalars['Int']['output'];
  type: DataHubJobType;
  updatedAt: Scalars['DateTime']['output'];
};

export type DataHubJobDryRunResult = {
  __typename?: 'DataHubJobDryRunResult';
  mappedRecords: Array<DataHubDryRunRecord>;
  summary: DataHubDryRunSummary;
  valid: Scalars['Boolean']['output'];
};

export type DataHubJobFilterParameter = {
  _and?: InputMaybe<Array<DataHubJobFilterParameter>>;
  _or?: InputMaybe<Array<DataHubJobFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  createdByUserId?: InputMaybe<StringOperators>;
  description?: InputMaybe<StringOperators>;
  enabled?: InputMaybe<BooleanOperators>;
  id?: InputMaybe<IdOperators>;
  lastRunAt?: InputMaybe<DateOperators>;
  lastRunStatus?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  publishedAt?: InputMaybe<DateOperators>;
  publishedByUserId?: InputMaybe<StringOperators>;
  runCount?: InputMaybe<NumberOperators>;
  status?: InputMaybe<StringOperators>;
  totalRecordsFailed?: InputMaybe<NumberOperators>;
  totalRecordsProcessed?: InputMaybe<NumberOperators>;
  type?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type DataHubJobList = PaginatedList & {
  __typename?: 'DataHubJobList';
  items: Array<DataHubJob>;
  totalItems: Scalars['Int']['output'];
};

export type DataHubJobListOptions = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  filterOperator?: InputMaybe<LogicalOperator>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type DataHubJobRun = Node & {
  __typename?: 'DataHubJobRun';
  checkpoint?: Maybe<Scalars['JSON']['output']>;
  createdAt: Scalars['DateTime']['output'];
  error?: Maybe<Scalars['String']['output']>;
  errors?: Maybe<Scalars['JSON']['output']>;
  finishedAt?: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  inputFileId?: Maybe<Scalars['String']['output']>;
  inputFileName?: Maybe<Scalars['String']['output']>;
  job: DataHubJob;
  metrics?: Maybe<Scalars['JSON']['output']>;
  outputFileId?: Maybe<Scalars['String']['output']>;
  outputFileName?: Maybe<Scalars['String']['output']>;
  progressMessage?: Maybe<Scalars['String']['output']>;
  progressPercent: Scalars['Int']['output'];
  startedAt?: Maybe<Scalars['DateTime']['output']>;
  startedByUserId?: Maybe<Scalars['String']['output']>;
  status: DataHubJobRunStatus;
  triggeredBy?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type DataHubJobRunFilterParameter = {
  _and?: InputMaybe<Array<DataHubJobRunFilterParameter>>;
  _or?: InputMaybe<Array<DataHubJobRunFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  error?: InputMaybe<StringOperators>;
  finishedAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  inputFileId?: InputMaybe<StringOperators>;
  inputFileName?: InputMaybe<StringOperators>;
  outputFileId?: InputMaybe<StringOperators>;
  outputFileName?: InputMaybe<StringOperators>;
  progressMessage?: InputMaybe<StringOperators>;
  progressPercent?: InputMaybe<NumberOperators>;
  startedAt?: InputMaybe<DateOperators>;
  startedByUserId?: InputMaybe<StringOperators>;
  status?: InputMaybe<StringOperators>;
  triggeredBy?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type DataHubJobRunList = PaginatedList & {
  __typename?: 'DataHubJobRunList';
  items: Array<DataHubJobRun>;
  totalItems: Scalars['Int']['output'];
};

export type DataHubJobRunListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<DataHubJobRunFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<DataHubJobRunSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type DataHubJobRunSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  error?: InputMaybe<SortOrder>;
  finishedAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  inputFileId?: InputMaybe<SortOrder>;
  inputFileName?: InputMaybe<SortOrder>;
  outputFileId?: InputMaybe<SortOrder>;
  outputFileName?: InputMaybe<SortOrder>;
  progressMessage?: InputMaybe<SortOrder>;
  progressPercent?: InputMaybe<SortOrder>;
  startedAt?: InputMaybe<SortOrder>;
  startedByUserId?: InputMaybe<SortOrder>;
  triggeredBy?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export enum DataHubJobRunStatus {
  CANCELLED = 'CANCELLED',
  CANCEL_REQUESTED = 'CANCEL_REQUESTED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
  PENDING = 'PENDING',
  RUNNING = 'RUNNING'
}

export type DataHubJobSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  createdByUserId?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lastRunAt?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  publishedAt?: InputMaybe<SortOrder>;
  publishedByUserId?: InputMaybe<SortOrder>;
  runCount?: InputMaybe<SortOrder>;
  totalRecordsFailed?: InputMaybe<SortOrder>;
  totalRecordsProcessed?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export enum DataHubJobStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
  DRAFT = 'DRAFT',
  PAUSED = 'PAUSED'
}

/** Jobs API - Simplified ETL Configuration */
export enum DataHubJobType {
  EXPORT = 'EXPORT',
  IMPORT = 'IMPORT',
  SYNC = 'SYNC'
}

/** Summary of load simulation */
export type DataHubLoadSummary = {
  __typename?: 'DataHubLoadSummary';
  adapterCode: Scalars['String']['output'];
  recordCount: Scalars['Int']['output'];
};

/** Schema definition for a Vendure entity type from LoaderRegistry */
export type DataHubLoaderEntitySchema = {
  __typename?: 'DataHubLoaderEntitySchema';
  /** Entity type (e.g., Product, ProductVariant, Customer) */
  entityType: Scalars['String']['output'];
  /** List of available fields for this entity */
  fields: Array<DataHubLoaderField>;
};

/** Definition of a single field within a loader entity schema */
export type DataHubLoaderField = {
  __typename?: 'DataHubLoaderField';
  /** Nested fields (for objects) */
  children?: Maybe<Array<DataHubLoaderField>>;
  /** Description/help text */
  description?: Maybe<Scalars['String']['output']>;
  /** Example value */
  example?: Maybe<Scalars['JSON']['output']>;
  /** Field key/path */
  key: Scalars['String']['output'];
  /** Human-readable label */
  label: Scalars['String']['output'];
  /** Can be used for lookup? */
  lookupable?: Maybe<Scalars['Boolean']['output']>;
  /** Is this field read-only? */
  readonly?: Maybe<Scalars['Boolean']['output']>;
  /** Related entity type (for relations) */
  relatedEntity?: Maybe<Scalars['String']['output']>;
  /** Is this field required? */
  required?: Maybe<Scalars['Boolean']['output']>;
  /** Is this field translatable? */
  translatable?: Maybe<Scalars['Boolean']['output']>;
  /** Field type */
  type: DataHubLoaderFieldType;
  /** Validation rules */
  validation?: Maybe<DataHubLoaderFieldValidation>;
};

/** Supported field types for loader entity schemas */
export enum DataHubLoaderFieldType {
  ARRAY = 'ARRAY',
  ASSET = 'ASSET',
  BOOLEAN = 'BOOLEAN',
  DATE = 'DATE',
  ENUM = 'ENUM',
  ID = 'ID',
  JSON = 'JSON',
  LOCALIZED_STRING = 'LOCALIZED_STRING',
  MONEY = 'MONEY',
  NUMBER = 'NUMBER',
  OBJECT = 'OBJECT',
  RELATION = 'RELATION',
  STRING = 'STRING'
}

/** Validation rules for a loader entity field */
export type DataHubLoaderFieldValidation = {
  __typename?: 'DataHubLoaderFieldValidation';
  enum?: Maybe<Array<Maybe<Scalars['JSON']['output']>>>;
  max?: Maybe<Scalars['Float']['output']>;
  maxLength?: Maybe<Scalars['Int']['output']>;
  min?: Maybe<Scalars['Float']['output']>;
  minLength?: Maybe<Scalars['Int']['output']>;
  pattern?: Maybe<Scalars['String']['output']>;
};

export type DataHubLog = Node & {
  __typename?: 'DataHubLog';
  context?: Maybe<Scalars['JSON']['output']>;
  createdAt: Scalars['DateTime']['output'];
  durationMs?: Maybe<Scalars['Int']['output']>;
  id: Scalars['ID']['output'];
  level: DataHubLogLevel;
  message: Scalars['String']['output'];
  metadata?: Maybe<Scalars['JSON']['output']>;
  pipeline?: Maybe<DataHubPipeline>;
  pipelineId?: Maybe<Scalars['ID']['output']>;
  recordsFailed?: Maybe<Scalars['Int']['output']>;
  recordsProcessed?: Maybe<Scalars['Int']['output']>;
  run?: Maybe<DataHubPipelineRun>;
  runId?: Maybe<Scalars['ID']['output']>;
  stepKey?: Maybe<Scalars['String']['output']>;
};

export type DataHubLogEntry = {
  __typename?: 'DataHubLogEntry';
  id: Scalars['ID']['output'];
  level: DataHubLogLevel;
  message: Scalars['String']['output'];
  metadata?: Maybe<Scalars['JSON']['output']>;
  pipelineCode?: Maybe<Scalars['String']['output']>;
  runId?: Maybe<Scalars['ID']['output']>;
  stepKey?: Maybe<Scalars['String']['output']>;
  timestamp: Scalars['DateTime']['output'];
};

export type DataHubLogFilterParameter = {
  _and?: InputMaybe<Array<DataHubLogFilterParameter>>;
  _or?: InputMaybe<Array<DataHubLogFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  durationMs?: InputMaybe<NumberOperators>;
  id?: InputMaybe<IdOperators>;
  level?: InputMaybe<StringOperators>;
  message?: InputMaybe<StringOperators>;
  pipelineId?: InputMaybe<IdOperators>;
  recordsFailed?: InputMaybe<NumberOperators>;
  recordsProcessed?: InputMaybe<NumberOperators>;
  runId?: InputMaybe<IdOperators>;
  stepKey?: InputMaybe<StringOperators>;
};

/** Logs & Telemetry API */
export enum DataHubLogLevel {
  DEBUG = 'DEBUG',
  ERROR = 'ERROR',
  INFO = 'INFO',
  WARN = 'WARN'
}

export type DataHubLogLevelCounts = {
  __typename?: 'DataHubLogLevelCounts';
  DEBUG: Scalars['Int']['output'];
  ERROR: Scalars['Int']['output'];
  INFO: Scalars['Int']['output'];
  WARN: Scalars['Int']['output'];
};

export type DataHubLogList = PaginatedList & {
  __typename?: 'DataHubLogList';
  items: Array<DataHubLog>;
  totalItems: Scalars['Int']['output'];
};

export type DataHubLogListOptions = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  filterOperator?: InputMaybe<LogicalOperator>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type DataHubLogSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  durationMs?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  message?: InputMaybe<SortOrder>;
  pipelineId?: InputMaybe<SortOrder>;
  recordsFailed?: InputMaybe<SortOrder>;
  recordsProcessed?: InputMaybe<SortOrder>;
  runId?: InputMaybe<SortOrder>;
  stepKey?: InputMaybe<SortOrder>;
};

export type DataHubLogStats = {
  __typename?: 'DataHubLogStats';
  avgDurationMs: Scalars['Int']['output'];
  byLevel: DataHubLogLevelCounts;
  errorsToday: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  warningsToday: Scalars['Int']['output'];
};

export type DataHubMappingValidation = {
  __typename?: 'DataHubMappingValidation';
  errors: Array<Scalars['String']['output']>;
  valid: Scalars['Boolean']['output'];
  warnings: Array<Scalars['String']['output']>;
};

export type DataHubOption = {
  __typename?: 'DataHubOption';
  label: Scalars['String']['output'];
  value: Scalars['String']['output'];
};

export type DataHubOptionValue = {
  __typename?: 'DataHubOptionValue';
  /** Optional category for UI grouping (e.g. Catalog, Orders) */
  category?: Maybe<Scalars['String']['output']>;
  /** Hex color code for UI display (e.g. #3b82f6) */
  color?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  /** Lucide icon name (kebab-case) for UI display */
  icon?: Maybe<Scalars['String']['output']>;
  label: Scalars['String']['output'];
  value: Scalars['String']['output'];
};

/** A data pipeline configuration defining steps, triggers, and execution flow */
export type DataHubPipeline = Node & {
  __typename?: 'DataHubPipeline';
  /** Unique identifier for webhook/API access */
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  /**
   * Pipeline definition containing steps, edges, triggers, and context.
   * Structure: { version: number, steps: Step[], edges?: Edge[], trigger?: Trigger, context?: Record<string, any> }
   */
  definition: Scalars['JSON']['output'];
  /** Whether the pipeline can be triggered */
  enabled: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  /** Human-readable pipeline name */
  name: Scalars['String']['output'];
  /** When the pipeline was last published */
  publishedAt?: Maybe<Scalars['DateTime']['output']>;
  /** User ID who published the pipeline */
  publishedByUserId?: Maybe<Scalars['String']['output']>;
  status: DataHubPipelineStatus;
  updatedAt: Scalars['DateTime']['output'];
  /** Schema version for definition format */
  version: Scalars['Int']['output'];
};

export type DataHubPipelineErrorCount = {
  __typename?: 'DataHubPipelineErrorCount';
  count: Scalars['Int']['output'];
  pipelineCode: Scalars['String']['output'];
};

export type DataHubPipelineFilterParameter = {
  _and?: InputMaybe<Array<DataHubPipelineFilterParameter>>;
  _or?: InputMaybe<Array<DataHubPipelineFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  enabled?: InputMaybe<BooleanOperators>;
  id?: InputMaybe<IdOperators>;
  name?: InputMaybe<StringOperators>;
  publishedAt?: InputMaybe<DateOperators>;
  publishedByUserId?: InputMaybe<StringOperators>;
  status?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
  version?: InputMaybe<NumberOperators>;
};

export type DataHubPipelineList = PaginatedList & {
  __typename?: 'DataHubPipelineList';
  items: Array<DataHubPipeline>;
  totalItems: Scalars['Int']['output'];
};

export type DataHubPipelineListOptions = {
  /** Filter configuration for field-based filtering */
  filter?: InputMaybe<Scalars['JSON']['input']>;
  /** Logical operator for combining filters */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Number of items to skip */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Sort configuration: { field: 'asc' | 'desc' } */
  sort?: InputMaybe<Scalars['JSON']['input']>;
  /** Number of items to return */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type DataHubPipelinePerformance = {
  __typename?: 'DataHubPipelinePerformance';
  avgDurationMs: Scalars['Float']['output'];
  failureCount: Scalars['Int']['output'];
  lastRunAt?: Maybe<Scalars['DateTime']['output']>;
  lastRunStatus?: Maybe<Scalars['String']['output']>;
  p50DurationMs: Scalars['Float']['output'];
  p95DurationMs: Scalars['Float']['output'];
  p99DurationMs: Scalars['Float']['output'];
  pipelineCode: Scalars['String']['output'];
  pipelineName: Scalars['String']['output'];
  runCount: Scalars['Int']['output'];
  successCount: Scalars['Int']['output'];
  successRate: Scalars['Float']['output'];
  totalRecordsFailed: Scalars['Int']['output'];
  totalRecordsProcessed: Scalars['Int']['output'];
};

/** Historical snapshot of a pipeline definition for version control */
export type DataHubPipelineRevision = Node & {
  __typename?: 'DataHubPipelineRevision';
  /** User ID who created this revision */
  authorUserId?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  /** Complete pipeline definition at this revision */
  definition: Scalars['JSON']['output'];
  id: Scalars['ID']['output'];
  updatedAt: Scalars['DateTime']['output'];
  /** Revision version number */
  version: Scalars['Int']['output'];
};

/** Pipeline revision with author, commit message, and change tracking */
export type DataHubPipelineRevisionExtended = Node & {
  __typename?: 'DataHubPipelineRevisionExtended';
  /** Display name of the author */
  authorName?: Maybe<Scalars['String']['output']>;
  authorUserId?: Maybe<Scalars['String']['output']>;
  /** Summary of changes from previous revision */
  changesSummary?: Maybe<Scalars['JSON']['output']>;
  /** User-provided description of changes */
  commitMessage?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  definition: Scalars['JSON']['output'];
  /** Hash for quick change detection */
  definitionHash?: Maybe<Scalars['String']['output']>;
  /** Size of definition in bytes */
  definitionSize: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  /** Reference to previous revision for diff */
  previousRevisionId?: Maybe<Scalars['ID']['output']>;
  /** Type of revision: draft (auto-save) or published (explicit version) */
  type: DataHubRevisionType;
  updatedAt: Scalars['DateTime']['output'];
  version: Scalars['Int']['output'];
};

/** A single execution instance of a pipeline */
export type DataHubPipelineRun = Node & {
  __typename?: 'DataHubPipelineRun';
  /** Checkpoint data for resumable pipelines: { lastProcessedId, cursor, state } */
  checkpoint?: Maybe<Scalars['JSON']['output']>;
  createdAt: Scalars['DateTime']['output'];
  /** Error message if run failed */
  error?: Maybe<Scalars['String']['output']>;
  finishedAt?: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  /** Execution metrics: { recordsProcessed, recordsFailed, stepMetrics, duration, etc. } */
  metrics?: Maybe<Scalars['JSON']['output']>;
  pipeline: DataHubPipeline;
  startedAt?: Maybe<Scalars['DateTime']['output']>;
  /** User ID who started the run (null for automated triggers) */
  startedByUserId?: Maybe<Scalars['String']['output']>;
  status: DataHubRunStatus;
  /** Trigger source identifier (e.g., 'manual', 'webhook:key', 'schedule:key', 'event:key') */
  triggeredBy?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type DataHubPipelineRunFilterParameter = {
  _and?: InputMaybe<Array<DataHubPipelineRunFilterParameter>>;
  _or?: InputMaybe<Array<DataHubPipelineRunFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  error?: InputMaybe<StringOperators>;
  finishedAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  startedAt?: InputMaybe<DateOperators>;
  startedByUserId?: InputMaybe<StringOperators>;
  status?: InputMaybe<StringOperators>;
  triggeredBy?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type DataHubPipelineRunList = PaginatedList & {
  __typename?: 'DataHubPipelineRunList';
  items: Array<DataHubPipelineRun>;
  totalItems: Scalars['Int']['output'];
};

export type DataHubPipelineRunListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<DataHubPipelineRunFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<DataHubPipelineRunSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type DataHubPipelineRunSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  error?: InputMaybe<SortOrder>;
  finishedAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  startedAt?: InputMaybe<SortOrder>;
  startedByUserId?: InputMaybe<SortOrder>;
  triggeredBy?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

/** Real-time Subscriptions for Pipeline Monitoring */
export type DataHubPipelineRunUpdate = {
  __typename?: 'DataHubPipelineRunUpdate';
  currentStep?: Maybe<Scalars['String']['output']>;
  error?: Maybe<Scalars['String']['output']>;
  finishedAt?: Maybe<Scalars['DateTime']['output']>;
  pipelineCode: Scalars['String']['output'];
  progressMessage?: Maybe<Scalars['String']['output']>;
  progressPercent: Scalars['Int']['output'];
  recordsFailed: Scalars['Int']['output'];
  recordsProcessed: Scalars['Int']['output'];
  runId: Scalars['ID']['output'];
  startedAt?: Maybe<Scalars['DateTime']['output']>;
  status: DataHubRunStatus;
};

export type DataHubPipelineSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  publishedAt?: InputMaybe<SortOrder>;
  publishedByUserId?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
  version?: InputMaybe<SortOrder>;
};

/** Pipeline lifecycle status for workflow management */
export enum DataHubPipelineStatus {
  /** Pipeline is deactivated but preserved for history */
  ARCHIVED = 'ARCHIVED',
  /** Initial state - pipeline is being designed */
  DRAFT = 'DRAFT',
  /** Pipeline is live and can be triggered */
  PUBLISHED = 'PUBLISHED',
  /** Pipeline submitted for review before publishing */
  REVIEW = 'REVIEW'
}

export type DataHubPreviewField = {
  __typename?: 'DataHubPreviewField';
  key: Scalars['String']['output'];
  label: Scalars['String']['output'];
  sampleValues: Scalars['JSON']['output'];
  type: Scalars['String']['output'];
};

/** Result from extract preview */
export type DataHubPreviewResult = {
  __typename?: 'DataHubPreviewResult';
  notes?: Maybe<Array<Scalars['String']['output']>>;
  records: Array<Scalars['JSON']['output']>;
  totalCount?: Maybe<Scalars['Int']['output']>;
};

export type DataHubPublishVersionInput = {
  commitMessage: Scalars['String']['input'];
  /** Optional: provide definition, otherwise uses current pipeline definition */
  definition?: InputMaybe<Scalars['JSON']['input']>;
  pipelineId: Scalars['ID']['input'];
};

export type DataHubQueueByPipeline = {
  __typename?: 'DataHubQueueByPipeline';
  code: Scalars['String']['output'];
  pending: Scalars['Int']['output'];
  running: Scalars['Int']['output'];
};

export type DataHubQueueStats = {
  __typename?: 'DataHubQueueStats';
  byPipeline: Array<DataHubQueueByPipeline>;
  completedToday: Scalars['Int']['output'];
  failed: Scalars['Int']['output'];
  pending: Scalars['Int']['output'];
  recentFailed: Array<DataHubRecentFailedRun>;
  running: Scalars['Int']['output'];
};

export type DataHubRealTimeStats = {
  __typename?: 'DataHubRealTimeStats';
  activeRuns: Scalars['Int']['output'];
  queuedRuns: Scalars['Int']['output'];
  recentErrors: Scalars['Int']['output'];
  recordsLastMinute: Scalars['Int']['output'];
};

export type DataHubRecentFailedRun = {
  __typename?: 'DataHubRecentFailedRun';
  code: Scalars['String']['output'];
  error?: Maybe<Scalars['String']['output']>;
  finishedAt?: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
};

/** Detailed record preview */
export type DataHubRecordDetail = {
  __typename?: 'DataHubRecordDetail';
  currentState?: Maybe<Scalars['JSON']['output']>;
  diff?: Maybe<Scalars['JSON']['output']>;
  entityType: Scalars['String']['output'];
  operation: DataHubRecordOperation;
  proposedState: Scalars['JSON']['output'];
  recordId: Scalars['String']['output'];
  validationErrors: Array<Scalars['String']['output']>;
  warnings: Array<Scalars['String']['output']>;
};

/** A record that failed processing during pipeline execution */
export type DataHubRecordError = Node & {
  __typename?: 'DataHubRecordError';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  /** Error message description */
  message: Scalars['String']['output'];
  /** The record data that failed to process */
  payload: Scalars['JSON']['output'];
  run: DataHubPipelineRun;
  /** The step key where the error occurred */
  stepKey: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export enum DataHubRecordOperation {
  CREATE = 'CREATE',
  DELETE = 'DELETE',
  SKIP = 'SKIP',
  UPDATE = 'UPDATE'
}

export enum DataHubRecordOutcome {
  ERROR = 'ERROR',
  FILTERED = 'FILTERED',
  SUCCESS = 'SUCCESS'
}

/** Audit trail for retry attempts on failed records */
export type DataHubRecordRetryAudit = Node & {
  __typename?: 'DataHubRecordRetryAudit';
  createdAt: Scalars['DateTime']['output'];
  error: DataHubRecordError;
  id: Scalars['ID']['output'];
  /** JSON Patch operations applied */
  patch: Scalars['JSON']['output'];
  /** Record state before the retry patch */
  previousPayload: Scalars['JSON']['output'];
  /** Record state after applying the patch */
  resultingPayload: Scalars['JSON']['output'];
  updatedAt: Scalars['DateTime']['output'];
  /** User ID who performed the retry */
  userId?: Maybe<Scalars['ID']['output']>;
};

export type DataHubRegisterDestinationResult = {
  __typename?: 'DataHubRegisterDestinationResult';
  id: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
};

export type DataHubRelationInfo = {
  __typename?: 'DataHubRelationInfo';
  entity: Scalars['String']['output'];
  multiple: Scalars['Boolean']['output'];
};

/** Resource usage estimate */
export type DataHubResourceEstimate = {
  __typename?: 'DataHubResourceEstimate';
  cpuPercent: Scalars['Int']['output'];
  databaseQueries: Scalars['Int']['output'];
  memoryMb: Scalars['Int']['output'];
  networkCalls: Scalars['Int']['output'];
};

export type DataHubRevertInput = {
  /** Optional: custom commit message */
  commitMessage?: InputMaybe<Scalars['String']['input']>;
  revisionId: Scalars['ID']['input'];
};

/** Complete diff between two revisions */
export type DataHubRevisionDiff = {
  __typename?: 'DataHubRevisionDiff';
  /** Elements that were added */
  added: Array<DataHubDiffEntry>;
  fromVersion: Scalars['Int']['output'];
  /** Elements that were modified */
  modified: Array<DataHubDiffEntry>;
  /** Elements that were removed */
  removed: Array<DataHubDiffEntry>;
  /** Human-readable summary */
  summary: Scalars['String']['output'];
  toVersion: Scalars['Int']['output'];
  /** Count of unchanged elements */
  unchangedCount: Scalars['Int']['output'];
};

export enum DataHubRevisionType {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED'
}

/** Overall risk assessment */
export type DataHubRiskAssessment = {
  __typename?: 'DataHubRiskAssessment';
  level: DataHubRiskLevel;
  score: Scalars['Int']['output'];
  warnings: Array<DataHubRiskWarning>;
};

export enum DataHubRiskLevel {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM'
}

export enum DataHubRiskSeverity {
  DANGER = 'DANGER',
  INFO = 'INFO',
  WARNING = 'WARNING'
}

/** Risk warning with details */
export type DataHubRiskWarning = {
  __typename?: 'DataHubRiskWarning';
  affectedCount?: Maybe<Scalars['Int']['output']>;
  details: Scalars['String']['output'];
  message: Scalars['String']['output'];
  recommendation?: Maybe<Scalars['String']['output']>;
  severity: DataHubRiskSeverity;
  type: Scalars['String']['output'];
};

export enum DataHubRunOutcome {
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
  SUCCESS = 'SUCCESS'
}

/** Pipeline run execution status */
export enum DataHubRunStatus {
  /** Run was cancelled */
  CANCELLED = 'CANCELLED',
  /** Cancellation requested, awaiting confirmation */
  CANCEL_REQUESTED = 'CANCEL_REQUESTED',
  /** Run finished successfully */
  COMPLETED = 'COMPLETED',
  /** Run failed with error */
  FAILED = 'FAILED',
  /** Run paused (resumable) */
  PAUSED = 'PAUSED',
  /** Run created but not yet started */
  PENDING = 'PENDING',
  /** Run queued for execution */
  QUEUED = 'QUEUED',
  /** Run currently executing */
  RUNNING = 'RUNNING',
  /** Run exceeded time limit */
  TIMEOUT = 'TIMEOUT'
}

/** Flow of a record through the pipeline */
export type DataHubSampleRecordFlow = {
  __typename?: 'DataHubSampleRecordFlow';
  errorMessage?: Maybe<Scalars['String']['output']>;
  finalData?: Maybe<Scalars['JSON']['output']>;
  outcome: DataHubRecordOutcome;
  recordId: Scalars['String']['output'];
  sourceData: Scalars['JSON']['output'];
  steps: Array<DataHubStepTransformation>;
};

/** Aggregated field change across all records */
export type DataHubSandboxAggregatedFieldChange = {
  __typename?: 'DataHubSandboxAggregatedFieldChange';
  /** Number of records affected */
  affectedCount: Scalars['Int']['output'];
  /** Type of change */
  changeType: DataHubSandboxFieldChangeType;
  /** Field name */
  field: Scalars['String']['output'];
  /** Percentage of records affected */
  percentage: Scalars['Int']['output'];
  /** Sample values after change */
  sampleAfter: Array<Scalars['JSON']['output']>;
  /** Sample values before change */
  sampleBefore: Array<Scalars['JSON']['output']>;
  /** Total records analyzed */
  totalRecords: Scalars['Int']['output'];
};

/** Comparison of two sandbox runs */
export type DataHubSandboxComparison = {
  __typename?: 'DataHubSandboxComparison';
  /** Second run result */
  after: DataHubSandboxResult;
  /** First run result */
  before: DataHubSandboxResult;
  /** Steps that changed */
  changedSteps: Array<DataHubSandboxStepComparison>;
  /** Summary of differences */
  summary: DataHubSandboxComparisonSummary;
};

/** Summary of differences between two sandbox runs */
export type DataHubSandboxComparisonSummary = {
  __typename?: 'DataHubSandboxComparisonSummary';
  /** Duration change */
  durationDeltaMs: Scalars['Int']['output'];
  /** Net change in failure count */
  failureCountDelta: Scalars['Int']['output'];
  /** Net change in filtered count */
  filteredCountDelta: Scalars['Int']['output'];
  /** Records that would be processed differently */
  recordsAffected: Scalars['Int']['output'];
  /** Total steps that changed behavior */
  stepsChanged: Scalars['Int']['output'];
  /** Net change in success count */
  successCountDelta: Scalars['Int']['output'];
};

/** Error collected during sandbox execution */
export type DataHubSandboxError = {
  __typename?: 'DataHubSandboxError';
  /** Error code */
  code: Scalars['String']['output'];
  /** Additional context */
  context?: Maybe<Scalars['JSON']['output']>;
  /** Error message */
  message: Scalars['String']['output'];
  /** Record index if applicable */
  recordIndex?: Maybe<Scalars['Int']['output']>;
  /** Stack trace if available */
  stack?: Maybe<Scalars['String']['output']>;
  /** Step that generated the error */
  stepKey: Scalars['String']['output'];
};

/** Type of field change detected in sandbox diff */
export enum DataHubSandboxFieldChangeType {
  ADDED = 'ADDED',
  MODIFIED = 'MODIFIED',
  REMOVED = 'REMOVED',
  TYPE_CHANGED = 'TYPE_CHANGED',
  UNCHANGED = 'UNCHANGED'
}

/** Field-level diff showing exactly what changed */
export type DataHubSandboxFieldDiff = {
  __typename?: 'DataHubSandboxFieldDiff';
  /** Data type after */
  afterType: Scalars['String']['output'];
  /** Value after the change */
  afterValue?: Maybe<Scalars['JSON']['output']>;
  /** Data type before */
  beforeType: Scalars['String']['output'];
  /** Value before the change */
  beforeValue?: Maybe<Scalars['JSON']['output']>;
  /** Type of change */
  changeType: DataHubSandboxFieldChangeType;
  /** Field name/path */
  field: Scalars['String']['output'];
};

/** Detail of a single load operation */
export type DataHubSandboxLoadOperationDetail = {
  __typename?: 'DataHubSandboxLoadOperationDetail';
  /** Record data */
  data: Scalars['JSON']['output'];
  /** Field diffs (for updates) */
  diff?: Maybe<Array<DataHubSandboxFieldDiff>>;
  /** Target entity ID (for updates) */
  entityId?: Maybe<Scalars['String']['output']>;
  /** Existing data (for updates) */
  existingData?: Maybe<Scalars['JSON']['output']>;
  /** Reason for this operation */
  reason: Scalars['String']['output'];
  /** Record ID from source */
  recordId?: Maybe<Scalars['String']['output']>;
  /** Record index */
  recordIndex: Scalars['Int']['output'];
};

/** Grouped load operations */
export type DataHubSandboxLoadOperations = {
  __typename?: 'DataHubSandboxLoadOperations';
  create: Array<DataHubSandboxLoadOperationDetail>;
  delete: Array<DataHubSandboxLoadOperationDetail>;
  error: Array<DataHubSandboxLoadOperationDetail>;
  skip: Array<DataHubSandboxLoadOperationDetail>;
  update: Array<DataHubSandboxLoadOperationDetail>;
};

/** Preview of load operations for a step */
export type DataHubSandboxLoadPreview = {
  __typename?: 'DataHubSandboxLoadPreview';
  /** Loader adapter code */
  adapterCode: Scalars['String']['output'];
  /** Target entity type */
  entityType: Scalars['String']['output'];
  /** Operations grouped by type */
  operations: DataHubSandboxLoadOperations;
  /** Summary counts */
  summary: DataHubSandboxLoadSummary;
  /** Warnings about the load operations */
  warnings: Array<Scalars['String']['output']>;
};

/** Summary of load operations by type */
export type DataHubSandboxLoadSummary = {
  __typename?: 'DataHubSandboxLoadSummary';
  createCount: Scalars['Int']['output'];
  deleteCount: Scalars['Int']['output'];
  errorCount: Scalars['Int']['output'];
  skipCount: Scalars['Int']['output'];
  updateCount: Scalars['Int']['output'];
};

/** Overall metrics from sandbox execution */
export type DataHubSandboxMetrics = {
  __typename?: 'DataHubSandboxMetrics';
  totalRecordsFailed: Scalars['Int']['output'];
  totalRecordsFiltered: Scalars['Int']['output'];
  totalRecordsProcessed: Scalars['Int']['output'];
  totalRecordsSucceeded: Scalars['Int']['output'];
};

/** Options for sandbox execution */
export type DataHubSandboxOptions = {
  /** Include full data lineage (default: true) */
  includeLineage?: InputMaybe<Scalars['Boolean']['input']>;
  /** Maximum records to process (default: 100) */
  maxRecords?: InputMaybe<Scalars['Int']['input']>;
  /** Maximum samples per step (default: 10) */
  maxSamplesPerStep?: InputMaybe<Scalars['Int']['input']>;
  /** Custom seed data to use */
  seedData?: InputMaybe<Array<Scalars['JSON']['input']>>;
  /** Steps to skip */
  skipSteps?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Start from a specific step (requires seed data) */
  startFromStep?: InputMaybe<Scalars['String']['input']>;
  /** Stop on first error (default: false) */
  stopOnError?: InputMaybe<Scalars['Boolean']['input']>;
  /** Timeout in milliseconds (default: 60000) */
  timeoutMs?: InputMaybe<Scalars['Int']['input']>;
};

/** Complete lineage trace for a single record through the pipeline */
export type DataHubSandboxRecordLineage = {
  __typename?: 'DataHubSandboxRecordLineage';
  /** Final outcome */
  finalOutcome: Scalars['String']['output'];
  /** Final record ID after processing */
  finalRecordId?: Maybe<Scalars['String']['output']>;
  /** Original record ID from source */
  originalRecordId?: Maybe<Scalars['String']['output']>;
  /** Index of this record */
  recordIndex: Scalars['Int']['output'];
  /** States at each step */
  states: Array<DataHubSandboxRecordState>;
};

/** Outcome of a record transformation in sandbox */
export enum DataHubSandboxRecordOutcome {
  ERROR = 'ERROR',
  FILTERED = 'FILTERED',
  SUCCESS = 'SUCCESS',
  UNCHANGED = 'UNCHANGED'
}

/** Sample record showing before/after state with diffs */
export type DataHubSandboxRecordSample = {
  __typename?: 'DataHubSandboxRecordSample';
  /** Record state after processing */
  after: Scalars['JSON']['output'];
  /** Record state before processing */
  before: Scalars['JSON']['output'];
  /** Error message if outcome is error */
  errorMessage?: Maybe<Scalars['String']['output']>;
  /** Field-level diffs for this record */
  fieldDiffs: Array<DataHubSandboxFieldDiff>;
  /** Outcome of processing this record */
  outcome: DataHubSandboxRecordOutcome;
  /** Extracted record ID if available */
  recordId?: Maybe<Scalars['String']['output']>;
  /** Index of this record in the batch */
  recordIndex: Scalars['Int']['output'];
};

/** State of a record at a specific step */
export type DataHubSandboxRecordState = {
  __typename?: 'DataHubSandboxRecordState';
  /** Record data at this point */
  data: Scalars['JSON']['output'];
  /** Notes about this state change */
  notes?: Maybe<Scalars['String']['output']>;
  /** State of the record */
  state: Scalars['String']['output'];
  /** Step key */
  stepKey: Scalars['String']['output'];
  /** Step type */
  stepType: Scalars['String']['output'];
  /** Timestamp */
  timestamp: Scalars['Float']['output'];
};

/** Complete result of sandbox/dry run execution */
export type DataHubSandboxResult = {
  __typename?: 'DataHubSandboxResult';
  /** Data lineage for record tracing */
  dataLineage: Array<DataHubSandboxRecordLineage>;
  /** All errors collected */
  errors: Array<DataHubSandboxError>;
  /** Load operation previews */
  loadPreviews: Array<DataHubSandboxLoadPreview>;
  /** Overall metrics */
  metrics: DataHubSandboxMetrics;
  /** Overall status */
  status: DataHubSandboxStatus;
  /** Step-by-step execution results */
  steps: Array<DataHubSandboxStepResult>;
  /** Total execution time in milliseconds */
  totalDurationMs: Scalars['Int']['output'];
  /** All warnings collected */
  warnings: Array<DataHubSandboxWarning>;
};

/** Overall status of sandbox execution */
export enum DataHubSandboxStatus {
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING'
}

/** Comparison of a single step between two runs */
export type DataHubSandboxStepComparison = {
  __typename?: 'DataHubSandboxStepComparison';
  /** Duration in after run */
  durationAfter: Scalars['Int']['output'];
  /** Duration in before run */
  durationBefore: Scalars['Int']['output'];
  /** Fields that changed behavior */
  fieldChanges: Array<Scalars['String']['output']>;
  /** Records out in after run */
  recordsOutAfter: Scalars['Int']['output'];
  /** Records out in before run */
  recordsOutBefore: Scalars['Int']['output'];
  stepKey: Scalars['String']['output'];
  stepName: Scalars['String']['output'];
};

/** Detailed result of executing a single step */
export type DataHubSandboxStepResult = {
  __typename?: 'DataHubSandboxStepResult';
  /** Execution time in milliseconds */
  durationMs: Scalars['Int']['output'];
  /** Error message if status is error */
  errorMessage?: Maybe<Scalars['String']['output']>;
  /** Aggregated field changes */
  fieldChanges: Array<DataHubSandboxAggregatedFieldChange>;
  /** Number of records that errored */
  recordsErrored: Scalars['Int']['output'];
  /** Number of records filtered out */
  recordsFiltered: Scalars['Int']['output'];
  /** Number of records entering this step */
  recordsIn: Scalars['Int']['output'];
  /** Number of records exiting this step */
  recordsOut: Scalars['Int']['output'];
  /** Sample records with before/after state */
  samples: Array<DataHubSandboxRecordSample>;
  /** Execution status */
  status: DataHubSandboxStepStatus;
  /** Step identifier */
  stepKey: Scalars['String']['output'];
  /** Human-readable step name */
  stepName: Scalars['String']['output'];
  /** Step type (extract, transform, load, etc.) */
  stepType: Scalars['String']['output'];
  /** Validation issues found (for validate steps) */
  validationIssues: Array<DataHubSandboxValidationIssue>;
  /** Warnings generated during execution */
  warnings: Array<Scalars['String']['output']>;
};

/** Status of a step execution in sandbox */
export enum DataHubSandboxStepStatus {
  ERROR = 'ERROR',
  SKIPPED = 'SKIPPED',
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING'
}

/** Validation issue found during sandbox processing */
export type DataHubSandboxValidationIssue = {
  __typename?: 'DataHubSandboxValidationIssue';
  /** Field with the issue */
  field: Scalars['String']['output'];
  /** Human-readable error message */
  message: Scalars['String']['output'];
  /** Record ID if available */
  recordId?: Maybe<Scalars['String']['output']>;
  /** Record index */
  recordIndex: Scalars['Int']['output'];
  /** Validation rule that failed */
  rule: Scalars['String']['output'];
  /** Severity of the issue */
  severity: DataHubSandboxValidationSeverity;
  /** The problematic value */
  value?: Maybe<Scalars['JSON']['output']>;
};

/** Severity of validation issues in sandbox */
export enum DataHubSandboxValidationSeverity {
  ERROR = 'ERROR',
  WARNING = 'WARNING'
}

/** Warning collected during sandbox execution */
export type DataHubSandboxWarning = {
  __typename?: 'DataHubSandboxWarning';
  /** Warning code */
  code: Scalars['String']['output'];
  /** Additional context */
  context?: Maybe<Scalars['JSON']['output']>;
  /** Warning message */
  message: Scalars['String']['output'];
  /** Step that generated the warning */
  stepKey: Scalars['String']['output'];
};

/** Input for executing sandbox with custom definition */
export type DataHubSandboxWithDefinitionInput = {
  /** Pipeline definition to test */
  definition: Scalars['JSON']['input'];
  /** Sandbox options */
  options?: InputMaybe<DataHubSandboxOptions>;
};

export type DataHubSaveDraftInput = {
  definition: Scalars['JSON']['input'];
  pipelineId: Scalars['ID']['input'];
};

/** Secrets API */
export type DataHubSecret = Node & {
  __typename?: 'DataHubSecret';
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  metadata?: Maybe<Scalars['JSON']['output']>;
  provider: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  value?: Maybe<Scalars['String']['output']>;
};

export type DataHubSecretFilterParameter = {
  _and?: InputMaybe<Array<DataHubSecretFilterParameter>>;
  _or?: InputMaybe<Array<DataHubSecretFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  provider?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
  value?: InputMaybe<StringOperators>;
};

export type DataHubSecretList = PaginatedList & {
  __typename?: 'DataHubSecretList';
  items: Array<DataHubSecret>;
  totalItems: Scalars['Int']['output'];
};

export type DataHubSecretListOptions = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  filterOperator?: InputMaybe<LogicalOperator>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type DataHubSecretSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  provider?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type DataHubSettings = {
  __typename?: 'DataHubSettings';
  /** Controls what level of logs are persisted to the database */
  logPersistenceLevel: LogPersistenceLevel;
  retentionDaysErrors?: Maybe<Scalars['Int']['output']>;
  retentionDaysLogs?: Maybe<Scalars['Int']['output']>;
  retentionDaysRuns?: Maybe<Scalars['Int']['output']>;
};

export type DataHubSettingsInput = {
  /** Controls what level of logs are persisted to the database */
  logPersistenceLevel?: InputMaybe<LogPersistenceLevel>;
  retentionDaysErrors?: InputMaybe<Scalars['Int']['input']>;
  retentionDaysLogs?: InputMaybe<Scalars['Int']['input']>;
  retentionDaysRuns?: InputMaybe<Scalars['Int']['input']>;
};

export type DataHubSourceFieldInput = {
  name: Scalars['String']['input'];
  sampleValues: Scalars['JSON']['input'];
  type: Scalars['String']['input'];
};

/** Step analysis result */
export type DataHubStepAnalysis = {
  __typename?: 'DataHubStepAnalysis';
  fieldChanges: Array<DataHubFieldChangePreview>;
  recordsIn: Scalars['Int']['output'];
  recordsOut: Scalars['Int']['output'];
  stepKey: Scalars['String']['output'];
  transformations: Array<DataHubStepTransformation>;
};

export type DataHubStepConfigSchema = {
  __typename?: 'DataHubStepConfigSchema';
  fields: Array<DataHubStepConfigSchemaField>;
  groups?: Maybe<Array<DataHubConfigFieldGroup>>;
};

export type DataHubStepConfigSchemaField = {
  __typename?: 'DataHubStepConfigSchemaField';
  defaultValue?: Maybe<Scalars['JSON']['output']>;
  dependsOn?: Maybe<DataHubFieldDependency>;
  description?: Maybe<Scalars['String']['output']>;
  group?: Maybe<Scalars['String']['output']>;
  key: Scalars['String']['output'];
  label?: Maybe<Scalars['String']['output']>;
  options?: Maybe<Array<DataHubOption>>;
  placeholder?: Maybe<Scalars['String']['output']>;
  required?: Maybe<Scalars['Boolean']['output']>;
  type: Scalars['String']['output'];
  validation?: Maybe<DataHubFieldValidation>;
};

export type DataHubStepErrorCount = {
  __typename?: 'DataHubStepErrorCount';
  count: Scalars['Int']['output'];
  stepKey: Scalars['String']['output'];
};

export type DataHubStepProgress = {
  __typename?: 'DataHubStepProgress';
  durationMs: Scalars['Int']['output'];
  recordsFailed: Scalars['Int']['output'];
  recordsIn: Scalars['Int']['output'];
  recordsOut: Scalars['Int']['output'];
  runId: Scalars['ID']['output'];
  status: Scalars['String']['output'];
  stepKey: Scalars['String']['output'];
};

/** Transformation details for a step */
export type DataHubStepTransformation = {
  __typename?: 'DataHubStepTransformation';
  durationMs: Scalars['Int']['output'];
  input: Scalars['JSON']['output'];
  notes: Array<Scalars['String']['output']>;
  output: Scalars['JSON']['output'];
  recordsIn: Scalars['Int']['output'];
  recordsOut: Scalars['Int']['output'];
  stepKey: Scalars['String']['output'];
  stepName: Scalars['String']['output'];
  stepType: Scalars['String']['output'];
};

export type DataHubStepTypeConfig = {
  __typename?: 'DataHubStepTypeConfig';
  /** Backend adapter type for registry lookup (e.g. EXTRACTOR, OPERATOR, LOADER). Null for step types without adapters. */
  adapterType?: Maybe<Scalars['String']['output']>;
  /** Background color hex code */
  bgColor: Scalars['String']['output'];
  /** Border color hex code */
  borderColor: Scalars['String']['output'];
  /** Step category for grouping (e.g. source, transform, load) */
  category: Scalars['String']['output'];
  /** Primary color hex code */
  color: Scalars['String']['output'];
  /** Description of what this step type does */
  description: Scalars['String']['output'];
  /** Lucide icon name (PascalCase) for UI display */
  icon: Scalars['String']['output'];
  /** Number of input handles */
  inputs: Scalars['Int']['output'];
  /** Human-readable label */
  label: Scalars['String']['output'];
  /** Visual node type for the pipeline editor (e.g. source, transform, load) */
  nodeType: Scalars['String']['output'];
  /** Number of output handles */
  outputs: Scalars['Int']['output'];
  /** Step type identifier (e.g. TRIGGER, EXTRACT, TRANSFORM) */
  type: Scalars['String']['output'];
};

export type DataHubStorageStats = {
  __typename?: 'DataHubStorageStats';
  byMimeType: Scalars['JSON']['output'];
  totalFiles: Scalars['Int']['output'];
  totalSize: Scalars['Int']['output'];
};

/** File Storage API - Upload and manage files */
export type DataHubStoredFile = Node & {
  __typename?: 'DataHubStoredFile';
  downloadUrl: Scalars['String']['output'];
  expiresAt?: Maybe<Scalars['DateTime']['output']>;
  hash: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  mimeType: Scalars['String']['output'];
  originalName: Scalars['String']['output'];
  previewUrl: Scalars['String']['output'];
  size: Scalars['Int']['output'];
  uploadedAt: Scalars['DateTime']['output'];
};

export type DataHubStoredFileList = PaginatedList & {
  __typename?: 'DataHubStoredFileList';
  items: Array<DataHubStoredFile>;
  totalItems: Scalars['Int']['output'];
};

/** Summary of a supported entity type */
export type DataHubSupportedEntity = {
  __typename?: 'DataHubSupportedEntity';
  /** Loader adapter code for this entity */
  adapterCode: Scalars['String']['output'];
  /** Entity type code */
  code: Scalars['String']['output'];
  /** Description of the entity */
  description?: Maybe<Scalars['String']['output']>;
  /** Human-readable name */
  name: Scalars['String']['output'];
  /** Supported operations (create, update, upsert, delete) */
  supportedOperations: Array<Scalars['String']['output']>;
};

/** Template category with metadata and template count */
export type DataHubTemplateCategory = {
  __typename?: 'DataHubTemplateCategory';
  category: Scalars['String']['output'];
  count: Scalars['Int']['output'];
  description: Scalars['String']['output'];
  icon: Scalars['String']['output'];
  label: Scalars['String']['output'];
};

export type DataHubThroughputMetrics = {
  __typename?: 'DataHubThroughputMetrics';
  avgBatchSize: Scalars['Float']['output'];
  peakRecordsPerSecond: Scalars['Float']['output'];
  recordsPerSecond: Scalars['Float']['output'];
  timeSeries: Array<DataHubTimeSeries>;
};

export type DataHubTimeSeries = {
  __typename?: 'DataHubTimeSeries';
  timestamp: Scalars['DateTime']['output'];
  value: Scalars['Float']['output'];
};

/** Timeline entry showing revision with run statistics */
export type DataHubTimelineEntry = {
  __typename?: 'DataHubTimelineEntry';
  /** When the last run was executed */
  lastRunAt?: Maybe<Scalars['DateTime']['output']>;
  /** Status of the last run */
  lastRunStatus?: Maybe<DataHubRunOutcome>;
  revision: DataHubTimelineRevision;
  /** Number of runs using this revision */
  runCount: Scalars['Int']['output'];
};

export type DataHubTimelineRevision = {
  __typename?: 'DataHubTimelineRevision';
  authorName?: Maybe<Scalars['String']['output']>;
  changesSummary?: Maybe<Scalars['JSON']['output']>;
  commitMessage?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  /** Whether this is the currently active revision */
  isCurrent: Scalars['Boolean']['output'];
  /** Whether this is the latest revision */
  isLatest: Scalars['Boolean']['output'];
  type: DataHubRevisionType;
  version: Scalars['Int']['output'];
};

export type DataHubTopError = {
  __typename?: 'DataHubTopError';
  count: Scalars['Int']['output'];
  firstOccurrence: Scalars['DateTime']['output'];
  lastOccurrence: Scalars['DateTime']['output'];
  message: Scalars['String']['output'];
};

export type DataHubTypedOptionValue = {
  __typename?: 'DataHubTypedOptionValue';
  /** Optional category for UI grouping */
  category?: Maybe<Scalars['String']['output']>;
  /** Key map for converting wizard field names to pipeline config keys (JSON object) */
  configKeyMap?: Maybe<Scalars['JSON']['output']>;
  /** Default values when creating a new entry of this type (JSON object) */
  defaultValues?: Maybe<Scalars['JSON']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  /** Form field definitions for this option type */
  fields: Array<DataHubConnectionSchemaField>;
  /** Lucide icon name (kebab-case) for UI display */
  icon?: Maybe<Scalars['String']['output']>;
  label: Scalars['String']['output'];
  value: Scalars['String']['output'];
  /** Which wizard scopes this option appears in (e.g. import, export) */
  wizardScopes?: Maybe<Array<Scalars['String']['output']>>;
};

/** Result from validate simulation */
export type DataHubValidateResult = {
  __typename?: 'DataHubValidateResult';
  records: Array<Scalars['JSON']['output']>;
  summary: DataHubValidationSummary;
};

/** A validation issue found in pipeline definition */
export type DataHubValidationIssue = {
  __typename?: 'DataHubValidationIssue';
  /** Specific field that caused the issue */
  field?: Maybe<Scalars['String']['output']>;
  /** Human-readable issue description */
  message: Scalars['String']['output'];
  /** Technical reason code for the issue */
  reason?: Maybe<Scalars['String']['output']>;
  /** Step key where issue was found (if applicable) */
  stepKey?: Maybe<Scalars['String']['output']>;
};

/** Result of pipeline definition validation */
export type DataHubValidationResult = {
  __typename?: 'DataHubValidationResult';
  /** Whether the definition passed validation */
  isValid: Scalars['Boolean']['output'];
  /** Detailed validation issues */
  issues: Array<DataHubValidationIssue>;
  /** Validation level used: SYNTAX | SEMANTIC | FULL */
  level?: Maybe<Scalars['String']['output']>;
  /** Non-blocking warnings */
  warnings?: Maybe<Array<DataHubValidationIssue>>;
};

/** Summary of validation results */
export type DataHubValidationSummary = {
  __typename?: 'DataHubValidationSummary';
  failed: Scalars['Int']['output'];
  input: Scalars['Int']['output'];
  passRate: Scalars['Int']['output'];
  passed: Scalars['Int']['output'];
};

export type DataHubVendureEntitySchema = {
  __typename?: 'DataHubVendureEntitySchema';
  description?: Maybe<Scalars['String']['output']>;
  entity: Scalars['String']['output'];
  exportable: Scalars['Boolean']['output'];
  fields: Array<DataHubEntityField>;
  importable: Scalars['Boolean']['output'];
  label: Scalars['String']['output'];
  lookupFields: Array<Scalars['String']['output']>;
};

export type DataHubWebhookDelivery = {
  __typename?: 'DataHubWebhookDelivery';
  attempts: Scalars['Int']['output'];
  createdAt: Scalars['DateTime']['output'];
  deliveredAt?: Maybe<Scalars['DateTime']['output']>;
  error?: Maybe<Scalars['String']['output']>;
  headers: Scalars['JSON']['output'];
  id: Scalars['String']['output'];
  lastAttemptAt?: Maybe<Scalars['DateTime']['output']>;
  maxAttempts: Scalars['Int']['output'];
  method: Scalars['String']['output'];
  nextRetryAt?: Maybe<Scalars['DateTime']['output']>;
  payload: Scalars['JSON']['output'];
  responseBody?: Maybe<Scalars['String']['output']>;
  responseStatus?: Maybe<Scalars['Int']['output']>;
  status: DataHubWebhookDeliveryStatus;
  url: Scalars['String']['output'];
  webhookId: Scalars['String']['output'];
};

/** Webhook Delivery API - Retry and DLQ management */
export enum DataHubWebhookDeliveryStatus {
  DEAD_LETTER = 'DEAD_LETTER',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
  RETRYING = 'RETRYING'
}

export type DataHubWebhookRetryResult = {
  __typename?: 'DataHubWebhookRetryResult';
  delivery?: Maybe<DataHubWebhookDelivery>;
  success: Scalars['Boolean']['output'];
};

export type DataHubWebhookStats = {
  __typename?: 'DataHubWebhookStats';
  byWebhook: Scalars['JSON']['output'];
  deadLetter: Scalars['Int']['output'];
  delivered: Scalars['Int']['output'];
  failed: Scalars['Int']['output'];
  pending: Scalars['Int']['output'];
  retrying: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type DataHubWebhookUpdate = {
  __typename?: 'DataHubWebhookUpdate';
  attempts: Scalars['Int']['output'];
  deliveryId: Scalars['String']['output'];
  error?: Maybe<Scalars['String']['output']>;
  lastAttemptAt?: Maybe<Scalars['DateTime']['output']>;
  responseStatus?: Maybe<Scalars['Int']['output']>;
  status: DataHubWebhookDeliveryStatus;
  webhookId: Scalars['String']['output'];
};

export type DataHubWizardStrategyMapping = {
  __typename?: 'DataHubWizardStrategyMapping';
  /** Backend ConflictStrategy to use (e.g. SOURCE_WINS, MERGE) */
  conflictStrategy: Scalars['String']['output'];
  /** Human-readable label */
  label: Scalars['String']['output'];
  /** Backend LoadStrategy to use (e.g. CREATE, UPSERT) */
  loadStrategy: Scalars['String']['output'];
  /** Wizard-internal value for existing records strategy (e.g. SKIP, UPDATE, REPLACE, ERROR) */
  wizardValue: Scalars['String']['output'];
};

/** Operators for filtering on a list of Date fields */
export type DateListOperators = {
  inList: Scalars['DateTime']['input'];
};

/** Operators for filtering on a DateTime field */
export type DateOperators = {
  after?: InputMaybe<Scalars['DateTime']['input']>;
  before?: InputMaybe<Scalars['DateTime']['input']>;
  between?: InputMaybe<DateRange>;
  eq?: InputMaybe<Scalars['DateTime']['input']>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type DateRange = {
  end: Scalars['DateTime']['input'];
  start: Scalars['DateTime']['input'];
};

/**
 * Expects the same validation formats as the `<input type="datetime-local">` HTML element.
 * See https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/datetime-local#Additional_attributes
 */
export type DateTimeCustomFieldConfig = CustomField & {
  __typename?: 'DateTimeCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  max?: Maybe<Scalars['String']['output']>;
  min?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  step?: Maybe<Scalars['Int']['output']>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

/**
 * Expects the same validation formats as the `<input type="datetime-local">` HTML element.
 * See https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/datetime-local#Additional_attributes
 */
export type DateTimeStructFieldConfig = StructField & {
  __typename?: 'DateTimeStructFieldConfig';
  description?: Maybe<Array<LocalizedString>>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  max?: Maybe<Scalars['String']['output']>;
  min?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  step?: Maybe<Scalars['Int']['output']>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type DeleteAssetInput = {
  assetId: Scalars['ID']['input'];
  deleteFromAllChannels?: InputMaybe<Scalars['Boolean']['input']>;
  force?: InputMaybe<Scalars['Boolean']['input']>;
};

export type DeleteAssetsInput = {
  assetIds: Array<Scalars['ID']['input']>;
  deleteFromAllChannels?: InputMaybe<Scalars['Boolean']['input']>;
  force?: InputMaybe<Scalars['Boolean']['input']>;
};

export type DeleteStockLocationInput = {
  id: Scalars['ID']['input'];
  transferToLocationId?: InputMaybe<Scalars['ID']['input']>;
};

export type DeletionResponse = {
  __typename?: 'DeletionResponse';
  message?: Maybe<Scalars['String']['output']>;
  result: DeletionResult;
};

export enum DeletionResult {
  /** The entity was successfully deleted */
  DELETED = 'DELETED',
  /** Deletion did not take place, reason given in message */
  NOT_DELETED = 'NOT_DELETED'
}

export type Discount = {
  __typename?: 'Discount';
  adjustmentSource: Scalars['String']['output'];
  amount: Scalars['Money']['output'];
  amountWithTax: Scalars['Money']['output'];
  description: Scalars['String']['output'];
  type: AdjustmentType;
};

export type DuplicateEntityError = ErrorResult & {
  __typename?: 'DuplicateEntityError';
  duplicationError: Scalars['String']['output'];
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type DuplicateEntityInput = {
  duplicatorInput: ConfigurableOperationInput;
  entityId: Scalars['ID']['input'];
  entityName: Scalars['String']['input'];
};

export type DuplicateEntityResult = DuplicateEntityError | DuplicateEntitySuccess;

export type DuplicateEntitySuccess = {
  __typename?: 'DuplicateEntitySuccess';
  newEntityId: Scalars['ID']['output'];
};

/** Returned when attempting to create a Customer with an email address already registered to an existing User. */
export type EmailAddressConflictError = ErrorResult & {
  __typename?: 'EmailAddressConflictError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/** Returned if no OrderLines have been specified for the operation */
export type EmptyOrderLineSelectionError = ErrorResult & {
  __typename?: 'EmptyOrderLineSelectionError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type EntityCustomFields = {
  __typename?: 'EntityCustomFields';
  customFields: Array<CustomFieldConfig>;
  entityName: Scalars['String']['output'];
};

export type EntityDuplicatorDefinition = {
  __typename?: 'EntityDuplicatorDefinition';
  args: Array<ConfigArgDefinition>;
  code: Scalars['String']['output'];
  description: Scalars['String']['output'];
  forEntities: Array<Scalars['String']['output']>;
  requiresPermission: Array<Permission>;
};

export enum ErrorCode {
  ALREADY_REFUNDED_ERROR = 'ALREADY_REFUNDED_ERROR',
  CANCEL_ACTIVE_ORDER_ERROR = 'CANCEL_ACTIVE_ORDER_ERROR',
  CANCEL_PAYMENT_ERROR = 'CANCEL_PAYMENT_ERROR',
  CHANNEL_DEFAULT_LANGUAGE_ERROR = 'CHANNEL_DEFAULT_LANGUAGE_ERROR',
  COUPON_CODE_EXPIRED_ERROR = 'COUPON_CODE_EXPIRED_ERROR',
  COUPON_CODE_INVALID_ERROR = 'COUPON_CODE_INVALID_ERROR',
  COUPON_CODE_LIMIT_ERROR = 'COUPON_CODE_LIMIT_ERROR',
  CREATE_FULFILLMENT_ERROR = 'CREATE_FULFILLMENT_ERROR',
  DUPLICATE_ENTITY_ERROR = 'DUPLICATE_ENTITY_ERROR',
  EMAIL_ADDRESS_CONFLICT_ERROR = 'EMAIL_ADDRESS_CONFLICT_ERROR',
  EMPTY_ORDER_LINE_SELECTION_ERROR = 'EMPTY_ORDER_LINE_SELECTION_ERROR',
  FACET_IN_USE_ERROR = 'FACET_IN_USE_ERROR',
  FULFILLMENT_STATE_TRANSITION_ERROR = 'FULFILLMENT_STATE_TRANSITION_ERROR',
  GUEST_CHECKOUT_ERROR = 'GUEST_CHECKOUT_ERROR',
  INELIGIBLE_SHIPPING_METHOD_ERROR = 'INELIGIBLE_SHIPPING_METHOD_ERROR',
  INSUFFICIENT_STOCK_ERROR = 'INSUFFICIENT_STOCK_ERROR',
  INSUFFICIENT_STOCK_ON_HAND_ERROR = 'INSUFFICIENT_STOCK_ON_HAND_ERROR',
  INVALID_CREDENTIALS_ERROR = 'INVALID_CREDENTIALS_ERROR',
  INVALID_FULFILLMENT_HANDLER_ERROR = 'INVALID_FULFILLMENT_HANDLER_ERROR',
  ITEMS_ALREADY_FULFILLED_ERROR = 'ITEMS_ALREADY_FULFILLED_ERROR',
  LANGUAGE_NOT_AVAILABLE_ERROR = 'LANGUAGE_NOT_AVAILABLE_ERROR',
  MANUAL_PAYMENT_STATE_ERROR = 'MANUAL_PAYMENT_STATE_ERROR',
  MIME_TYPE_ERROR = 'MIME_TYPE_ERROR',
  MISSING_CONDITIONS_ERROR = 'MISSING_CONDITIONS_ERROR',
  MULTIPLE_ORDER_ERROR = 'MULTIPLE_ORDER_ERROR',
  NATIVE_AUTH_STRATEGY_ERROR = 'NATIVE_AUTH_STRATEGY_ERROR',
  NEGATIVE_QUANTITY_ERROR = 'NEGATIVE_QUANTITY_ERROR',
  NOTHING_TO_REFUND_ERROR = 'NOTHING_TO_REFUND_ERROR',
  NO_ACTIVE_ORDER_ERROR = 'NO_ACTIVE_ORDER_ERROR',
  NO_CHANGES_SPECIFIED_ERROR = 'NO_CHANGES_SPECIFIED_ERROR',
  ORDER_INTERCEPTOR_ERROR = 'ORDER_INTERCEPTOR_ERROR',
  ORDER_LIMIT_ERROR = 'ORDER_LIMIT_ERROR',
  ORDER_MODIFICATION_ERROR = 'ORDER_MODIFICATION_ERROR',
  ORDER_MODIFICATION_STATE_ERROR = 'ORDER_MODIFICATION_STATE_ERROR',
  ORDER_STATE_TRANSITION_ERROR = 'ORDER_STATE_TRANSITION_ERROR',
  PAYMENT_METHOD_MISSING_ERROR = 'PAYMENT_METHOD_MISSING_ERROR',
  PAYMENT_ORDER_MISMATCH_ERROR = 'PAYMENT_ORDER_MISMATCH_ERROR',
  PAYMENT_STATE_TRANSITION_ERROR = 'PAYMENT_STATE_TRANSITION_ERROR',
  PRODUCT_OPTION_IN_USE_ERROR = 'PRODUCT_OPTION_IN_USE_ERROR',
  QUANTITY_TOO_GREAT_ERROR = 'QUANTITY_TOO_GREAT_ERROR',
  REFUND_AMOUNT_ERROR = 'REFUND_AMOUNT_ERROR',
  REFUND_ORDER_STATE_ERROR = 'REFUND_ORDER_STATE_ERROR',
  REFUND_PAYMENT_ID_MISSING_ERROR = 'REFUND_PAYMENT_ID_MISSING_ERROR',
  REFUND_STATE_TRANSITION_ERROR = 'REFUND_STATE_TRANSITION_ERROR',
  SETTLE_PAYMENT_ERROR = 'SETTLE_PAYMENT_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export type ErrorResult = {
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type Facet = Node & {
  __typename?: 'Facet';
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  isPrivate: Scalars['Boolean']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  translations: Array<FacetTranslation>;
  updatedAt: Scalars['DateTime']['output'];
  /** Returns a paginated, sortable, filterable list of the Facet's values. Added in v2.1.0. */
  valueList: FacetValueList;
  values: Array<FacetValue>;
};


export type FacetValueListArgs = {
  options?: InputMaybe<FacetValueListOptions>;
};

export type FacetFilterParameter = {
  _and?: InputMaybe<Array<FacetFilterParameter>>;
  _or?: InputMaybe<Array<FacetFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  isPrivate?: InputMaybe<BooleanOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type FacetInUseError = ErrorResult & {
  __typename?: 'FacetInUseError';
  errorCode: ErrorCode;
  facetCode: Scalars['String']['output'];
  message: Scalars['String']['output'];
  productCount: Scalars['Int']['output'];
  variantCount: Scalars['Int']['output'];
};

export type FacetList = PaginatedList & {
  __typename?: 'FacetList';
  items: Array<Facet>;
  totalItems: Scalars['Int']['output'];
};

export type FacetListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<FacetFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<FacetSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type FacetSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type FacetTranslation = {
  __typename?: 'FacetTranslation';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type FacetTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type FacetValue = Node & {
  __typename?: 'FacetValue';
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  facet: Facet;
  facetId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  translations: Array<FacetValueTranslation>;
  updatedAt: Scalars['DateTime']['output'];
};

/**
 * Used to construct boolean expressions for filtering search results
 * by FacetValue ID. Examples:
 *
 * * ID=1 OR ID=2: `{ facetValueFilters: [{ or: [1,2] }] }`
 * * ID=1 AND ID=2: `{ facetValueFilters: [{ and: 1 }, { and: 2 }] }`
 * * ID=1 AND (ID=2 OR ID=3): `{ facetValueFilters: [{ and: 1 }, { or: [2,3] }] }`
 */
export type FacetValueFilterInput = {
  and?: InputMaybe<Scalars['ID']['input']>;
  or?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type FacetValueFilterParameter = {
  _and?: InputMaybe<Array<FacetValueFilterParameter>>;
  _or?: InputMaybe<Array<FacetValueFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  facetId?: InputMaybe<IdOperators>;
  id?: InputMaybe<IdOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type FacetValueList = PaginatedList & {
  __typename?: 'FacetValueList';
  items: Array<FacetValue>;
  totalItems: Scalars['Int']['output'];
};

export type FacetValueListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<FacetValueFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<FacetValueSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

/**
 * Which FacetValues are present in the products returned
 * by the search, and in what quantity.
 */
export type FacetValueResult = {
  __typename?: 'FacetValueResult';
  count: Scalars['Int']['output'];
  facetValue: FacetValue;
};

export type FacetValueSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  facetId?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type FacetValueTranslation = {
  __typename?: 'FacetValueTranslation';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type FacetValueTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type FloatCustomFieldConfig = CustomField & {
  __typename?: 'FloatCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  max?: Maybe<Scalars['Float']['output']>;
  min?: Maybe<Scalars['Float']['output']>;
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  step?: Maybe<Scalars['Float']['output']>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type FloatStructFieldConfig = StructField & {
  __typename?: 'FloatStructFieldConfig';
  description?: Maybe<Array<LocalizedString>>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  max?: Maybe<Scalars['Float']['output']>;
  min?: Maybe<Scalars['Float']['output']>;
  name: Scalars['String']['output'];
  step?: Maybe<Scalars['Float']['output']>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type FulfillOrderInput = {
  handler: ConfigurableOperationInput;
  lines: Array<OrderLineInput>;
};

export type Fulfillment = Node & {
  __typename?: 'Fulfillment';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  lines: Array<FulfillmentLine>;
  method: Scalars['String']['output'];
  nextStates: Array<Scalars['String']['output']>;
  state: Scalars['String']['output'];
  /** @deprecated Use the `lines` field instead */
  summary: Array<FulfillmentLine>;
  trackingCode?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type FulfillmentLine = {
  __typename?: 'FulfillmentLine';
  fulfillment: Fulfillment;
  fulfillmentId: Scalars['ID']['output'];
  orderLine: OrderLine;
  orderLineId: Scalars['ID']['output'];
  quantity: Scalars['Int']['output'];
};

/** Returned when there is an error in transitioning the Fulfillment state */
export type FulfillmentStateTransitionError = ErrorResult & {
  __typename?: 'FulfillmentStateTransitionError';
  errorCode: ErrorCode;
  fromState: Scalars['String']['output'];
  message: Scalars['String']['output'];
  toState: Scalars['String']['output'];
  transitionError: Scalars['String']['output'];
};

export enum GlobalFlag {
  FALSE = 'FALSE',
  INHERIT = 'INHERIT',
  TRUE = 'TRUE'
}

export type GlobalSettings = {
  __typename?: 'GlobalSettings';
  availableLanguages: Array<LanguageCode>;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  outOfStockThreshold: Scalars['Int']['output'];
  serverConfig: ServerConfig;
  trackInventory: Scalars['Boolean']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

/** Returned when attempting to set the Customer on a guest checkout when the configured GuestCheckoutStrategy does not allow it. */
export type GuestCheckoutError = ErrorResult & {
  __typename?: 'GuestCheckoutError';
  errorCode: ErrorCode;
  errorDetail: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type HistoryEntry = Node & {
  __typename?: 'HistoryEntry';
  administrator?: Maybe<Administrator>;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  data: Scalars['JSON']['output'];
  id: Scalars['ID']['output'];
  isPublic: Scalars['Boolean']['output'];
  type: HistoryEntryType;
  updatedAt: Scalars['DateTime']['output'];
};

export type HistoryEntryFilterParameter = {
  _and?: InputMaybe<Array<HistoryEntryFilterParameter>>;
  _or?: InputMaybe<Array<HistoryEntryFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  isPublic?: InputMaybe<BooleanOperators>;
  type?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type HistoryEntryList = PaginatedList & {
  __typename?: 'HistoryEntryList';
  items: Array<HistoryEntry>;
  totalItems: Scalars['Int']['output'];
};

export type HistoryEntryListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<HistoryEntryFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<HistoryEntrySortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type HistoryEntrySortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export enum HistoryEntryType {
  CUSTOMER_ADDED_TO_GROUP = 'CUSTOMER_ADDED_TO_GROUP',
  CUSTOMER_ADDRESS_CREATED = 'CUSTOMER_ADDRESS_CREATED',
  CUSTOMER_ADDRESS_DELETED = 'CUSTOMER_ADDRESS_DELETED',
  CUSTOMER_ADDRESS_UPDATED = 'CUSTOMER_ADDRESS_UPDATED',
  CUSTOMER_DETAIL_UPDATED = 'CUSTOMER_DETAIL_UPDATED',
  CUSTOMER_EMAIL_UPDATE_REQUESTED = 'CUSTOMER_EMAIL_UPDATE_REQUESTED',
  CUSTOMER_EMAIL_UPDATE_VERIFIED = 'CUSTOMER_EMAIL_UPDATE_VERIFIED',
  CUSTOMER_NOTE = 'CUSTOMER_NOTE',
  CUSTOMER_PASSWORD_RESET_REQUESTED = 'CUSTOMER_PASSWORD_RESET_REQUESTED',
  CUSTOMER_PASSWORD_RESET_VERIFIED = 'CUSTOMER_PASSWORD_RESET_VERIFIED',
  CUSTOMER_PASSWORD_UPDATED = 'CUSTOMER_PASSWORD_UPDATED',
  CUSTOMER_REGISTERED = 'CUSTOMER_REGISTERED',
  CUSTOMER_REMOVED_FROM_GROUP = 'CUSTOMER_REMOVED_FROM_GROUP',
  CUSTOMER_VERIFIED = 'CUSTOMER_VERIFIED',
  ORDER_CANCELLATION = 'ORDER_CANCELLATION',
  ORDER_COUPON_APPLIED = 'ORDER_COUPON_APPLIED',
  ORDER_COUPON_REMOVED = 'ORDER_COUPON_REMOVED',
  ORDER_CUSTOMER_UPDATED = 'ORDER_CUSTOMER_UPDATED',
  ORDER_FULFILLMENT = 'ORDER_FULFILLMENT',
  ORDER_FULFILLMENT_TRANSITION = 'ORDER_FULFILLMENT_TRANSITION',
  ORDER_MODIFIED = 'ORDER_MODIFIED',
  ORDER_NOTE = 'ORDER_NOTE',
  ORDER_PAYMENT_TRANSITION = 'ORDER_PAYMENT_TRANSITION',
  ORDER_REFUND_TRANSITION = 'ORDER_REFUND_TRANSITION',
  ORDER_STATE_TRANSITION = 'ORDER_STATE_TRANSITION'
}

/** Operators for filtering on a list of ID fields */
export type IdListOperators = {
  inList: Scalars['ID']['input'];
};

/** Operators for filtering on an ID field */
export type IdOperators = {
  eq?: InputMaybe<Scalars['String']['input']>;
  in?: InputMaybe<Array<Scalars['String']['input']>>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  notEq?: InputMaybe<Scalars['String']['input']>;
  notIn?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type ImportInfo = {
  __typename?: 'ImportInfo';
  errors?: Maybe<Array<Scalars['String']['output']>>;
  imported: Scalars['Int']['output'];
  processed: Scalars['Int']['output'];
};

/** Returned when attempting to set a ShippingMethod for which the Order is not eligible */
export type IneligibleShippingMethodError = ErrorResult & {
  __typename?: 'IneligibleShippingMethodError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/** Returned when attempting to add more items to the Order than are available */
export type InsufficientStockError = ErrorResult & {
  __typename?: 'InsufficientStockError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
  order: Order;
  quantityAvailable: Scalars['Int']['output'];
};

/**
 * Returned if attempting to create a Fulfillment when there is insufficient
 * stockOnHand of a ProductVariant to satisfy the requested quantity.
 */
export type InsufficientStockOnHandError = ErrorResult & {
  __typename?: 'InsufficientStockOnHandError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
  productVariantId: Scalars['ID']['output'];
  productVariantName: Scalars['String']['output'];
  stockOnHand: Scalars['Int']['output'];
};

export type IntCustomFieldConfig = CustomField & {
  __typename?: 'IntCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  max?: Maybe<Scalars['Int']['output']>;
  min?: Maybe<Scalars['Int']['output']>;
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  step?: Maybe<Scalars['Int']['output']>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type IntStructFieldConfig = StructField & {
  __typename?: 'IntStructFieldConfig';
  description?: Maybe<Array<LocalizedString>>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  max?: Maybe<Scalars['Int']['output']>;
  min?: Maybe<Scalars['Int']['output']>;
  name: Scalars['String']['output'];
  step?: Maybe<Scalars['Int']['output']>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

/** Returned if the user authentication credentials are not valid */
export type InvalidCredentialsError = ErrorResult & {
  __typename?: 'InvalidCredentialsError';
  authenticationError: Scalars['String']['output'];
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/** Returned if the specified FulfillmentHandler code is not valid */
export type InvalidFulfillmentHandlerError = ErrorResult & {
  __typename?: 'InvalidFulfillmentHandlerError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/** Returned if the specified items are already part of a Fulfillment */
export type ItemsAlreadyFulfilledError = ErrorResult & {
  __typename?: 'ItemsAlreadyFulfilledError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type Job = Node & {
  __typename?: 'Job';
  attempts: Scalars['Int']['output'];
  createdAt: Scalars['DateTime']['output'];
  data?: Maybe<Scalars['JSON']['output']>;
  duration: Scalars['Int']['output'];
  error?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  isSettled: Scalars['Boolean']['output'];
  progress: Scalars['Float']['output'];
  queueName: Scalars['String']['output'];
  result?: Maybe<Scalars['JSON']['output']>;
  retries: Scalars['Int']['output'];
  settledAt?: Maybe<Scalars['DateTime']['output']>;
  startedAt?: Maybe<Scalars['DateTime']['output']>;
  state: JobState;
};

export type JobBufferSize = {
  __typename?: 'JobBufferSize';
  bufferId: Scalars['String']['output'];
  size: Scalars['Int']['output'];
};

export type JobFilterParameter = {
  _and?: InputMaybe<Array<JobFilterParameter>>;
  _or?: InputMaybe<Array<JobFilterParameter>>;
  attempts?: InputMaybe<NumberOperators>;
  createdAt?: InputMaybe<DateOperators>;
  duration?: InputMaybe<NumberOperators>;
  id?: InputMaybe<IdOperators>;
  isSettled?: InputMaybe<BooleanOperators>;
  progress?: InputMaybe<NumberOperators>;
  queueName?: InputMaybe<StringOperators>;
  retries?: InputMaybe<NumberOperators>;
  settledAt?: InputMaybe<DateOperators>;
  startedAt?: InputMaybe<DateOperators>;
  state?: InputMaybe<StringOperators>;
};

export type JobList = PaginatedList & {
  __typename?: 'JobList';
  items: Array<Job>;
  totalItems: Scalars['Int']['output'];
};

export type JobListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<JobFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<JobSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type JobQueue = {
  __typename?: 'JobQueue';
  name: Scalars['String']['output'];
  running: Scalars['Boolean']['output'];
};

export type JobSortParameter = {
  attempts?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  duration?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  progress?: InputMaybe<SortOrder>;
  queueName?: InputMaybe<SortOrder>;
  retries?: InputMaybe<SortOrder>;
  settledAt?: InputMaybe<SortOrder>;
  startedAt?: InputMaybe<SortOrder>;
};

/**
 * @description
 * The state of a Job in the JobQueue
 *
 * @docsCategory common
 */
export enum JobState {
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
  RETRYING = 'RETRYING',
  RUNNING = 'RUNNING'
}

/**
 * @description
 * Languages in the form of a ISO 639-1 language code with optional
 * region or script modifier (e.g. de_AT). The selection available is based
 * on the [Unicode CLDR summary list](https://unicode-org.github.io/cldr-staging/charts/37/summary/root.html)
 * and includes the major spoken languages of the world and any widely-used variants.
 *
 * @docsCategory common
 */
export enum LanguageCode {
  /** Afrikaans */
  af = 'af',
  /** Akan */
  ak = 'ak',
  /** Amharic */
  am = 'am',
  /** Arabic */
  ar = 'ar',
  /** Assamese */
  as = 'as',
  /** Azerbaijani */
  az = 'az',
  /** Belarusian */
  be = 'be',
  /** Bulgarian */
  bg = 'bg',
  /** Bambara */
  bm = 'bm',
  /** Bangla */
  bn = 'bn',
  /** Tibetan */
  bo = 'bo',
  /** Breton */
  br = 'br',
  /** Bosnian */
  bs = 'bs',
  /** Catalan */
  ca = 'ca',
  /** Chechen */
  ce = 'ce',
  /** Corsican */
  co = 'co',
  /** Czech */
  cs = 'cs',
  /** Church Slavic */
  cu = 'cu',
  /** Welsh */
  cy = 'cy',
  /** Danish */
  da = 'da',
  /** German */
  de = 'de',
  /** Austrian German */
  de_AT = 'de_AT',
  /** Swiss High German */
  de_CH = 'de_CH',
  /** Dzongkha */
  dz = 'dz',
  /** Ewe */
  ee = 'ee',
  /** Greek */
  el = 'el',
  /** English */
  en = 'en',
  /** Australian English */
  en_AU = 'en_AU',
  /** Canadian English */
  en_CA = 'en_CA',
  /** British English */
  en_GB = 'en_GB',
  /** American English */
  en_US = 'en_US',
  /** Esperanto */
  eo = 'eo',
  /** Spanish */
  es = 'es',
  /** European Spanish */
  es_ES = 'es_ES',
  /** Mexican Spanish */
  es_MX = 'es_MX',
  /** Estonian */
  et = 'et',
  /** Basque */
  eu = 'eu',
  /** Persian */
  fa = 'fa',
  /** Dari */
  fa_AF = 'fa_AF',
  /** Fulah */
  ff = 'ff',
  /** Finnish */
  fi = 'fi',
  /** Faroese */
  fo = 'fo',
  /** French */
  fr = 'fr',
  /** Canadian French */
  fr_CA = 'fr_CA',
  /** Swiss French */
  fr_CH = 'fr_CH',
  /** Western Frisian */
  fy = 'fy',
  /** Irish */
  ga = 'ga',
  /** Scottish Gaelic */
  gd = 'gd',
  /** Galician */
  gl = 'gl',
  /** Gujarati */
  gu = 'gu',
  /** Manx */
  gv = 'gv',
  /** Hausa */
  ha = 'ha',
  /** Hebrew */
  he = 'he',
  /** Hindi */
  hi = 'hi',
  /** Croatian */
  hr = 'hr',
  /** Haitian Creole */
  ht = 'ht',
  /** Hungarian */
  hu = 'hu',
  /** Armenian */
  hy = 'hy',
  /** Interlingua */
  ia = 'ia',
  /** Indonesian */
  id = 'id',
  /** Igbo */
  ig = 'ig',
  /** Sichuan Yi */
  ii = 'ii',
  /** Icelandic */
  is = 'is',
  /** Italian */
  it = 'it',
  /** Japanese */
  ja = 'ja',
  /** Javanese */
  jv = 'jv',
  /** Georgian */
  ka = 'ka',
  /** Kikuyu */
  ki = 'ki',
  /** Kazakh */
  kk = 'kk',
  /** Kalaallisut */
  kl = 'kl',
  /** Khmer */
  km = 'km',
  /** Kannada */
  kn = 'kn',
  /** Korean */
  ko = 'ko',
  /** Kashmiri */
  ks = 'ks',
  /** Kurdish */
  ku = 'ku',
  /** Cornish */
  kw = 'kw',
  /** Kyrgyz */
  ky = 'ky',
  /** Latin */
  la = 'la',
  /** Luxembourgish */
  lb = 'lb',
  /** Ganda */
  lg = 'lg',
  /** Lingala */
  ln = 'ln',
  /** Lao */
  lo = 'lo',
  /** Lithuanian */
  lt = 'lt',
  /** Luba-Katanga */
  lu = 'lu',
  /** Latvian */
  lv = 'lv',
  /** Malagasy */
  mg = 'mg',
  /** Maori */
  mi = 'mi',
  /** Macedonian */
  mk = 'mk',
  /** Malayalam */
  ml = 'ml',
  /** Mongolian */
  mn = 'mn',
  /** Marathi */
  mr = 'mr',
  /** Malay */
  ms = 'ms',
  /** Maltese */
  mt = 'mt',
  /** Burmese */
  my = 'my',
  /** Norwegian Bokmål */
  nb = 'nb',
  /** North Ndebele */
  nd = 'nd',
  /** Nepali */
  ne = 'ne',
  /** Dutch */
  nl = 'nl',
  /** Flemish */
  nl_BE = 'nl_BE',
  /** Norwegian Nynorsk */
  nn = 'nn',
  /** Nyanja */
  ny = 'ny',
  /** Oromo */
  om = 'om',
  /** Odia */
  or = 'or',
  /** Ossetic */
  os = 'os',
  /** Punjabi */
  pa = 'pa',
  /** Polish */
  pl = 'pl',
  /** Pashto */
  ps = 'ps',
  /** Portuguese */
  pt = 'pt',
  /** Brazilian Portuguese */
  pt_BR = 'pt_BR',
  /** European Portuguese */
  pt_PT = 'pt_PT',
  /** Quechua */
  qu = 'qu',
  /** Romansh */
  rm = 'rm',
  /** Rundi */
  rn = 'rn',
  /** Romanian */
  ro = 'ro',
  /** Moldavian */
  ro_MD = 'ro_MD',
  /** Russian */
  ru = 'ru',
  /** Kinyarwanda */
  rw = 'rw',
  /** Sanskrit */
  sa = 'sa',
  /** Sindhi */
  sd = 'sd',
  /** Northern Sami */
  se = 'se',
  /** Sango */
  sg = 'sg',
  /** Sinhala */
  si = 'si',
  /** Slovak */
  sk = 'sk',
  /** Slovenian */
  sl = 'sl',
  /** Samoan */
  sm = 'sm',
  /** Shona */
  sn = 'sn',
  /** Somali */
  so = 'so',
  /** Albanian */
  sq = 'sq',
  /** Serbian */
  sr = 'sr',
  /** Southern Sotho */
  st = 'st',
  /** Sundanese */
  su = 'su',
  /** Swedish */
  sv = 'sv',
  /** Swahili */
  sw = 'sw',
  /** Congo Swahili */
  sw_CD = 'sw_CD',
  /** Tamil */
  ta = 'ta',
  /** Telugu */
  te = 'te',
  /** Tajik */
  tg = 'tg',
  /** Thai */
  th = 'th',
  /** Tigrinya */
  ti = 'ti',
  /** Turkmen */
  tk = 'tk',
  /** Tongan */
  to = 'to',
  /** Turkish */
  tr = 'tr',
  /** Tatar */
  tt = 'tt',
  /** Uyghur */
  ug = 'ug',
  /** Ukrainian */
  uk = 'uk',
  /** Urdu */
  ur = 'ur',
  /** Uzbek */
  uz = 'uz',
  /** Vietnamese */
  vi = 'vi',
  /** Volapük */
  vo = 'vo',
  /** Wolof */
  wo = 'wo',
  /** Xhosa */
  xh = 'xh',
  /** Yiddish */
  yi = 'yi',
  /** Yoruba */
  yo = 'yo',
  /** Chinese */
  zh = 'zh',
  /** Simplified Chinese */
  zh_Hans = 'zh_Hans',
  /** Traditional Chinese */
  zh_Hant = 'zh_Hant',
  /** Zulu */
  zu = 'zu'
}

/** Returned if attempting to set a Channel's defaultLanguageCode to a language which is not enabled in GlobalSettings */
export type LanguageNotAvailableError = ErrorResult & {
  __typename?: 'LanguageNotAvailableError';
  errorCode: ErrorCode;
  languageCode: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type LocaleStringCustomFieldConfig = CustomField & {
  __typename?: 'LocaleStringCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  length?: Maybe<Scalars['Int']['output']>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  pattern?: Maybe<Scalars['String']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type LocaleTextCustomFieldConfig = CustomField & {
  __typename?: 'LocaleTextCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type LocalizedString = {
  __typename?: 'LocalizedString';
  languageCode: LanguageCode;
  value: Scalars['String']['output'];
};

/**
 * Log persistence levels - controls what gets saved to database for the dashboard.
 * Higher levels include all events from lower levels.
 */
export enum LogPersistenceLevel {
  /** All events including debug-level information */
  DEBUG = 'DEBUG',
  /** Only errors are persisted to database */
  ERROR_ONLY = 'ERROR_ONLY',
  /** Pipeline start/complete/fail + errors (default) */
  PIPELINE = 'PIPELINE',
  /** All pipeline events + step start/complete events */
  STEP = 'STEP'
}

export enum LogicalOperator {
  AND = 'AND',
  OR = 'OR'
}

export type ManualPaymentInput = {
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  method: Scalars['String']['input'];
  orderId: Scalars['ID']['input'];
  transactionId?: InputMaybe<Scalars['String']['input']>;
};

/**
 * Returned when a call to addManualPaymentToOrder is made but the Order
 * is not in the required state.
 */
export type ManualPaymentStateError = ErrorResult & {
  __typename?: 'ManualPaymentStateError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type MimeTypeError = ErrorResult & {
  __typename?: 'MimeTypeError';
  errorCode: ErrorCode;
  fileName: Scalars['String']['output'];
  message: Scalars['String']['output'];
  mimeType: Scalars['String']['output'];
};

/** Returned if a PromotionCondition has neither a couponCode nor any conditions set */
export type MissingConditionsError = ErrorResult & {
  __typename?: 'MissingConditionsError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type ModifyOrderInput = {
  addItems?: InputMaybe<Array<AddItemInput>>;
  adjustOrderLines?: InputMaybe<Array<OrderLineInput>>;
  couponCodes?: InputMaybe<Array<Scalars['String']['input']>>;
  dryRun: Scalars['Boolean']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
  options?: InputMaybe<ModifyOrderOptions>;
  orderId: Scalars['ID']['input'];
  /**
   * Deprecated in v2.2.0. Use `refunds` instead to allow multiple refunds to be
   * applied in the case that multiple payment methods have been used on the order.
   */
  refund?: InputMaybe<AdministratorRefundInput>;
  refunds?: InputMaybe<Array<AdministratorRefundInput>>;
  /** Added in v2.2 */
  shippingMethodIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  surcharges?: InputMaybe<Array<SurchargeInput>>;
  updateBillingAddress?: InputMaybe<UpdateOrderAddressInput>;
  updateShippingAddress?: InputMaybe<UpdateOrderAddressInput>;
};

export type ModifyOrderOptions = {
  freezePromotions?: InputMaybe<Scalars['Boolean']['input']>;
  recalculateShipping?: InputMaybe<Scalars['Boolean']['input']>;
};

export type ModifyOrderResult = CouponCodeExpiredError | CouponCodeInvalidError | CouponCodeLimitError | IneligibleShippingMethodError | InsufficientStockError | NegativeQuantityError | NoChangesSpecifiedError | Order | OrderLimitError | OrderModificationStateError | PaymentMethodMissingError | RefundPaymentIdMissingError;

export type MoveCollectionInput = {
  collectionId: Scalars['ID']['input'];
  index: Scalars['Int']['input'];
  parentId: Scalars['ID']['input'];
};

/** Returned if an operation has specified OrderLines from multiple Orders */
export type MultipleOrderError = ErrorResult & {
  __typename?: 'MultipleOrderError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  activateDataHubJob: DataHubJob;
  /** Add Customers to a CustomerGroup */
  addCustomersToGroup: CustomerGroup;
  addFulfillmentToOrder: AddFulfillmentToOrderResult;
  /** Adds an item to the draft Order. */
  addItemToDraftOrder: UpdateOrderItemsResult;
  /**
   * Used to manually create a new Payment against an Order.
   * This can be used by an Administrator when an Order is in the ArrangingPayment state.
   *
   * It is also used when a completed Order
   * has been modified (using `modifyOrder`) and the price has increased. The extra payment
   * can then be manually arranged by the administrator, and the details used to create a new
   * Payment.
   */
  addManualPaymentToOrder: AddManualPaymentToOrderResult;
  /** Add members to a Zone */
  addMembersToZone: Zone;
  addNoteToCustomer: Customer;
  addNoteToOrder: Order;
  /** Add an OptionGroup to a Product */
  addOptionGroupToProduct: Product;
  /** Adjusts a draft OrderLine. If custom fields are defined on the OrderLine entity, a third argument 'customFields' of type `OrderLineCustomFieldsInput` will be available. */
  adjustDraftOrderLine: UpdateOrderItemsResult;
  /** Applies the given coupon code to the draft Order */
  applyCouponCodeToDraftOrder: ApplyCouponCodeResult;
  /** Approve a GATE step, resuming the paused pipeline run */
  approveDataHubGate: DataHubGateActionResult;
  approveDataHubPipeline: DataHubPipeline;
  archiveDataHubJob: DataHubJob;
  archiveDataHubPipeline: DataHubPipeline;
  /** Assign assets to channel */
  assignAssetsToChannel: Array<Asset>;
  /** Assigns Collections to the specified Channel */
  assignCollectionsToChannel: Array<Collection>;
  /** Assigns Facets to the specified Channel */
  assignFacetsToChannel: Array<Facet>;
  /** Assigns PaymentMethods to the specified Channel */
  assignPaymentMethodsToChannel: Array<PaymentMethod>;
  /** Assigns ProductVariants to the specified Channel */
  assignProductVariantsToChannel: Array<ProductVariant>;
  /** Assigns all ProductVariants of Product to the specified Channel */
  assignProductsToChannel: Array<Product>;
  /** Assigns Promotions to the specified Channel */
  assignPromotionsToChannel: Array<Promotion>;
  /** Assign a Role to an Administrator */
  assignRoleToAdministrator: Administrator;
  /** Assigns ShippingMethods to the specified Channel */
  assignShippingMethodsToChannel: Array<ShippingMethod>;
  /** Assigns StockLocations to the specified Channel */
  assignStockLocationsToChannel: Array<StockLocation>;
  /** Authenticates the user using a named authentication strategy */
  authenticate: AuthenticationResult;
  cancelDataHubJobRun: DataHubJobRun;
  cancelDataHubPipelineRun: DataHubPipelineRun;
  cancelJob: Job;
  cancelOrder: CancelOrderResult;
  cancelPayment: CancelPaymentResult;
  /** Create a new Administrator */
  createAdministrator: Administrator;
  /** Create a new Asset */
  createAssets: Array<CreateAssetResult>;
  /** Create a new Channel */
  createChannel: CreateChannelResult;
  /** Create a new Collection */
  createCollection: Collection;
  /** Create a new Country */
  createCountry: Country;
  /** Create a new Customer. If a password is provided, a new User will also be created an linked to the Customer. */
  createCustomer: CreateCustomerResult;
  /** Create a new Address and associate it with the Customer specified by customerId */
  createCustomerAddress: Address;
  /** Create a new CustomerGroup */
  createCustomerGroup: CustomerGroup;
  createDataHubConnection: DataHubConnection;
  createDataHubFeed: DataHubFeed;
  createDataHubJob: DataHubJob;
  createDataHubPipeline: DataHubPipeline;
  createDataHubSecret: DataHubSecret;
  /** Creates a draft Order */
  createDraftOrder: Order;
  /** Create a new Facet */
  createFacet: Facet;
  /** Create a single FacetValue */
  createFacetValue: FacetValue;
  /** Create one or more FacetValues */
  createFacetValues: Array<FacetValue>;
  /** Create existing PaymentMethod */
  createPaymentMethod: PaymentMethod;
  /** Create a new Product */
  createProduct: Product;
  /** Create a new ProductOption within a ProductOptionGroup */
  createProductOption: ProductOption;
  /** Create a new ProductOptionGroup */
  createProductOptionGroup: ProductOptionGroup;
  /** Create a set of ProductVariants based on the OptionGroups assigned to the given Product */
  createProductVariants: Array<Maybe<ProductVariant>>;
  createPromotion: CreatePromotionResult;
  /** Create a new Province */
  createProvince: Province;
  /** Create a new Role */
  createRole: Role;
  /** Create a new Seller */
  createSeller: Seller;
  /** Create a new ShippingMethod */
  createShippingMethod: ShippingMethod;
  createStockLocation: StockLocation;
  /** Create a new Tag */
  createTag: Tag;
  /** Create a new TaxCategory */
  createTaxCategory: TaxCategory;
  /** Create a new TaxRate */
  createTaxRate: TaxRate;
  /** Create a new Zone */
  createZone: Zone;
  dataHubDeliverToDestination: DataHubDeliveryResult;
  /** Prune old draft revisions */
  dataHubPruneDrafts: Scalars['Int']['output'];
  /** Publish a new version with commit message */
  dataHubPublishVersion: DataHubPipelineRevisionExtended;
  dataHubRegisterExportDestination: DataHubRegisterDestinationResult;
  dataHubRemoveDeadLetter: DataHubDeadLetterResult;
  /** Replay a specific step with custom input */
  dataHubReplayStep: DataHubSandboxStepResult;
  /** Restore a draft to the working copy (without publishing) */
  dataHubRestoreDraft: DataHubPipeline;
  dataHubRetryDeadLetter: DataHubWebhookRetryResult;
  /** Revert to a specific revision (creates new published version) */
  dataHubRevertToRevision: DataHubPipelineRevisionExtended;
  /** Save a draft revision (auto-save) */
  dataHubSaveDraft?: Maybe<DataHubPipelineRevisionExtended>;
  dataHubTestExportDestination: DataHubDestinationTestResult;
  /** Execute sandbox with custom seed data for testing specific scenarios */
  dataHubTestWithSeedData: DataHubSandboxResult;
  /** Delete an Administrator */
  deleteAdministrator: DeletionResponse;
  /** Delete multiple Administrators */
  deleteAdministrators: Array<DeletionResponse>;
  /** Delete an Asset */
  deleteAsset: DeletionResponse;
  /** Delete multiple Assets */
  deleteAssets: DeletionResponse;
  /** Delete a Channel */
  deleteChannel: DeletionResponse;
  /** Delete multiple Channels */
  deleteChannels: Array<DeletionResponse>;
  /** Delete a Collection and all of its descendants */
  deleteCollection: DeletionResponse;
  /** Delete multiple Collections and all of their descendants */
  deleteCollections: Array<DeletionResponse>;
  /** Delete multiple Countries */
  deleteCountries: Array<DeletionResponse>;
  /** Delete a Country */
  deleteCountry: DeletionResponse;
  /** Delete a Customer */
  deleteCustomer: DeletionResponse;
  /** Update an existing Address */
  deleteCustomerAddress: Success;
  /** Delete a CustomerGroup */
  deleteCustomerGroup: DeletionResponse;
  /** Delete multiple CustomerGroups */
  deleteCustomerGroups: Array<DeletionResponse>;
  deleteCustomerNote: DeletionResponse;
  /** Deletes Customers */
  deleteCustomers: Array<DeletionResponse>;
  deleteDataHubConnection: DeletionResponse;
  deleteDataHubJob: DeletionResponse;
  deleteDataHubPipeline: DeletionResponse;
  deleteDataHubSecret: DeletionResponse;
  /** Deletes a draft Order */
  deleteDraftOrder: DeletionResponse;
  /** Delete an existing Facet */
  deleteFacet: DeletionResponse;
  /** Delete one or more FacetValues */
  deleteFacetValues: Array<DeletionResponse>;
  /** Delete multiple existing Facets */
  deleteFacets: Array<DeletionResponse>;
  deleteOrderNote: DeletionResponse;
  /** Delete a PaymentMethod */
  deletePaymentMethod: DeletionResponse;
  /** Delete multiple PaymentMethods */
  deletePaymentMethods: Array<DeletionResponse>;
  /** Delete a Product */
  deleteProduct: DeletionResponse;
  /** Delete a ProductOption */
  deleteProductOption: DeletionResponse;
  /** Delete a ProductVariant */
  deleteProductVariant: DeletionResponse;
  /** Delete multiple ProductVariants */
  deleteProductVariants: Array<DeletionResponse>;
  /** Delete multiple Products */
  deleteProducts: Array<DeletionResponse>;
  deletePromotion: DeletionResponse;
  deletePromotions: Array<DeletionResponse>;
  /** Delete a Province */
  deleteProvince: DeletionResponse;
  /** Delete an existing Role */
  deleteRole: DeletionResponse;
  /** Delete multiple Roles */
  deleteRoles: Array<DeletionResponse>;
  /** Delete a Seller */
  deleteSeller: DeletionResponse;
  /** Delete multiple Sellers */
  deleteSellers: Array<DeletionResponse>;
  /** Delete a ShippingMethod */
  deleteShippingMethod: DeletionResponse;
  /** Delete multiple ShippingMethods */
  deleteShippingMethods: Array<DeletionResponse>;
  deleteStockLocation: DeletionResponse;
  deleteStockLocations: Array<DeletionResponse>;
  /** Delete an existing Tag */
  deleteTag: DeletionResponse;
  /** Deletes multiple TaxCategories */
  deleteTaxCategories: Array<DeletionResponse>;
  /** Deletes a TaxCategory */
  deleteTaxCategory: DeletionResponse;
  /** Delete a TaxRate */
  deleteTaxRate: DeletionResponse;
  /** Delete multiple TaxRates */
  deleteTaxRates: Array<DeletionResponse>;
  /** Delete a Zone */
  deleteZone: DeletionResponse;
  /** Delete a Zone */
  deleteZones: Array<DeletionResponse>;
  dryRunDataHubJob: DataHubJobDryRunResult;
  duplicateDataHubJob: DataHubJob;
  /**
   * Duplicate an existing entity using a specific EntityDuplicator.
   * Since v2.2.0.
   */
  duplicateEntity: DuplicateEntityResult;
  flushBufferedJobs: Success;
  generateDataHubFeed: DataHubFeedGenerationResult;
  importProducts?: Maybe<ImportInfo>;
  /**
   * Authenticates the user using the native authentication strategy. This mutation is an alias for authenticate({ native: { ... }})
   *
   * The `rememberMe` option applies when using cookie-based sessions, and if `true` it will set the maxAge of the session cookie
   * to 1 year.
   */
  login: NativeAuthenticationResult;
  logout: Success;
  markDataHubDeadLetter: Scalars['Boolean']['output'];
  /**
   * Allows an Order to be modified after it has been completed by the Customer. The Order must first
   * be in the `Modifying` state.
   */
  modifyOrder: ModifyOrderResult;
  /** Move a Collection to a different parent or index */
  moveCollection: Collection;
  pauseDataHubJob: DataHubJob;
  /** Preview extract step - runs extractor and returns sample records */
  previewDataHubExtract: DataHubPreviewResult;
  previewDataHubFeed: DataHubFeedPreview;
  previewDataHubFile: DataHubFilePreview;
  publishDataHubPipeline: DataHubPipeline;
  refundOrder: RefundOrderResult;
  reindex: Job;
  /** Reject a GATE step, cancelling the paused pipeline run */
  rejectDataHubGate: DataHubGateActionResult;
  rejectDataHubPipelineReview: DataHubPipeline;
  /** Removes Collections from the specified Channel */
  removeCollectionsFromChannel: Array<Collection>;
  /** Removes the given coupon code from the draft Order */
  removeCouponCodeFromDraftOrder?: Maybe<Order>;
  /** Remove Customers from a CustomerGroup */
  removeCustomersFromGroup: CustomerGroup;
  /** Remove an OrderLine from the draft Order */
  removeDraftOrderLine: RemoveOrderItemsResult;
  /** Removes Facets from the specified Channel */
  removeFacetsFromChannel: Array<RemoveFacetFromChannelResult>;
  /** Remove members from a Zone */
  removeMembersFromZone: Zone;
  /**
   * Remove an OptionGroup from a Product. If the OptionGroup is in use by any ProductVariants
   * the mutation will return a ProductOptionInUseError, and the OptionGroup will not be removed.
   * Setting the `force` argument to `true` will override this and remove the OptionGroup anyway,
   * as well as removing any of the group's options from the Product's ProductVariants.
   */
  removeOptionGroupFromProduct: RemoveOptionGroupFromProductResult;
  /** Removes PaymentMethods from the specified Channel */
  removePaymentMethodsFromChannel: Array<PaymentMethod>;
  /** Removes ProductVariants from the specified Channel */
  removeProductVariantsFromChannel: Array<ProductVariant>;
  /** Removes all ProductVariants of Product from the specified Channel */
  removeProductsFromChannel: Array<Product>;
  /** Removes Promotions from the specified Channel */
  removePromotionsFromChannel: Array<Promotion>;
  /** Remove all settled jobs in the given queues older than the given date. Returns the number of jobs deleted. */
  removeSettledJobs: Scalars['Int']['output'];
  /** Removes ShippingMethods from the specified Channel */
  removeShippingMethodsFromChannel: Array<ShippingMethod>;
  /** Removes StockLocations from the specified Channel */
  removeStockLocationsFromChannel: Array<StockLocation>;
  /** Reset AutoMapper configuration to defaults (global or per-pipeline) */
  resetDataHubAutoMapperConfig: DataHubAutoMapperConfig;
  retryDataHubRecord: Scalars['Boolean']['output'];
  revertDataHubPipelineToRevision: DataHubPipeline;
  runDataHubHookTest: Scalars['Boolean']['output'];
  runPendingSearchIndexUpdates: Success;
  runScheduledTask: Success;
  setCustomerForDraftOrder: SetCustomerForDraftOrderResult;
  /** Sets the billing address for a draft Order */
  setDraftOrderBillingAddress: Order;
  /** Allows any custom fields to be set for the active order */
  setDraftOrderCustomFields: Order;
  /** Sets the shipping address for a draft Order */
  setDraftOrderShippingAddress: Order;
  /** Sets the shipping method by id, which can be obtained with the `eligibleShippingMethodsForDraftOrder` query */
  setDraftOrderShippingMethod: SetOrderShippingMethodResult;
  setOrderCustomFields?: Maybe<Order>;
  /** Allows a different Customer to be assigned to an Order. Added in v2.2.0. */
  setOrderCustomer?: Maybe<Order>;
  /** Set a single key-value pair (automatically scoped based on field configuration) */
  setSettingsStoreValue: SetSettingsStoreValueResult;
  /** Set multiple key-value pairs in a transaction (each automatically scoped) */
  setSettingsStoreValues: Array<SetSettingsStoreValueResult>;
  settlePayment: SettlePaymentResult;
  settleRefund: SettleRefundResult;
  /** Simulate load step - checks what would be created/updated without writing */
  simulateDataHubLoad: Scalars['JSON']['output'];
  /** Simulate transform step - applies transforms to input records */
  simulateDataHubTransform: Array<Scalars['JSON']['output']>;
  /** Simulate validate step - runs validation rules on input records */
  simulateDataHubValidate: DataHubValidateResult;
  startDataHubConsumer: Scalars['Boolean']['output'];
  startDataHubJobRun: DataHubJobRun;
  startDataHubPipelineDryRun: DataHubDryRunResult;
  startDataHubPipelineRun: DataHubPipelineRun;
  stopDataHubConsumer: Scalars['Boolean']['output'];
  submitDataHubPipelineForReview: DataHubPipeline;
  suggestDataHubMappings: Array<DataHubFieldSuggestion>;
  transitionFulfillmentToState: TransitionFulfillmentToStateResult;
  transitionOrderToState?: Maybe<TransitionOrderToStateResult>;
  transitionPaymentToState: TransitionPaymentToStateResult;
  /** Unsets the billing address for a draft Order */
  unsetDraftOrderBillingAddress: Order;
  /** Unsets the shipping address for a draft Order */
  unsetDraftOrderShippingAddress: Order;
  /** Update the active (currently logged-in) Administrator */
  updateActiveAdministrator: Administrator;
  /** Update an existing Administrator */
  updateAdministrator: Administrator;
  /** Update an existing Asset */
  updateAsset: Asset;
  /** Update an existing Channel */
  updateChannel: UpdateChannelResult;
  /** Update an existing Collection */
  updateCollection: Collection;
  /** Update an existing Country */
  updateCountry: Country;
  /** Update an existing Customer */
  updateCustomer: UpdateCustomerResult;
  /** Update an existing Address */
  updateCustomerAddress: Address;
  /** Update an existing CustomerGroup */
  updateCustomerGroup: CustomerGroup;
  updateCustomerNote: HistoryEntry;
  /** Update AutoMapper configuration (global or per-pipeline) */
  updateDataHubAutoMapperConfig: DataHubAutoMapperConfig;
  updateDataHubCheckpoint: DataHubCheckpoint;
  updateDataHubConnection: DataHubConnection;
  updateDataHubJob: DataHubJob;
  updateDataHubPipeline: DataHubPipeline;
  updateDataHubSecret: DataHubSecret;
  updateDataHubSettings: DataHubSettings;
  /** Update an existing Facet */
  updateFacet: Facet;
  /** Update a single FacetValue */
  updateFacetValue: FacetValue;
  /** Update one or more FacetValues */
  updateFacetValues: Array<FacetValue>;
  updateGlobalSettings: UpdateGlobalSettingsResult;
  updateOrderNote: HistoryEntry;
  /** Update an existing PaymentMethod */
  updatePaymentMethod: PaymentMethod;
  /** Update an existing Product */
  updateProduct: Product;
  /** Create a new ProductOption within a ProductOptionGroup */
  updateProductOption: ProductOption;
  /** Update an existing ProductOptionGroup */
  updateProductOptionGroup: ProductOptionGroup;
  /** Update an existing ProductVariant */
  updateProductVariant: ProductVariant;
  /** Update existing ProductVariants */
  updateProductVariants: Array<Maybe<ProductVariant>>;
  /** Update multiple existing Products */
  updateProducts: Array<Product>;
  updatePromotion: UpdatePromotionResult;
  /** Update an existing Province */
  updateProvince: Province;
  /** Update an existing Role */
  updateRole: Role;
  updateScheduledTask: ScheduledTask;
  /** Update an existing Seller */
  updateSeller: Seller;
  /** Update an existing ShippingMethod */
  updateShippingMethod: ShippingMethod;
  updateStockLocation: StockLocation;
  /** Update an existing Tag */
  updateTag: Tag;
  /** Update an existing TaxCategory */
  updateTaxCategory: TaxCategory;
  /** Update an existing TaxRate */
  updateTaxRate: TaxRate;
  /** Update an existing Zone */
  updateZone: Zone;
  validateDataHubMappings: DataHubMappingValidation;
};


export type MutationActivateDataHubJobArgs = {
  id: Scalars['ID']['input'];
};


export type MutationAddCustomersToGroupArgs = {
  customerGroupId: Scalars['ID']['input'];
  customerIds: Array<Scalars['ID']['input']>;
};


export type MutationAddFulfillmentToOrderArgs = {
  input: FulfillOrderInput;
};


export type MutationAddItemToDraftOrderArgs = {
  input: AddItemToDraftOrderInput;
  orderId: Scalars['ID']['input'];
};


export type MutationAddManualPaymentToOrderArgs = {
  input: ManualPaymentInput;
};


export type MutationAddMembersToZoneArgs = {
  memberIds: Array<Scalars['ID']['input']>;
  zoneId: Scalars['ID']['input'];
};


export type MutationAddNoteToCustomerArgs = {
  input: AddNoteToCustomerInput;
};


export type MutationAddNoteToOrderArgs = {
  input: AddNoteToOrderInput;
};


export type MutationAddOptionGroupToProductArgs = {
  optionGroupId: Scalars['ID']['input'];
  productId: Scalars['ID']['input'];
};


export type MutationAdjustDraftOrderLineArgs = {
  input: AdjustDraftOrderLineInput;
  orderId: Scalars['ID']['input'];
};


export type MutationApplyCouponCodeToDraftOrderArgs = {
  couponCode: Scalars['String']['input'];
  orderId: Scalars['ID']['input'];
};


export type MutationApproveDataHubGateArgs = {
  runId: Scalars['ID']['input'];
  stepKey: Scalars['String']['input'];
};


export type MutationApproveDataHubPipelineArgs = {
  id: Scalars['ID']['input'];
};


export type MutationArchiveDataHubJobArgs = {
  id: Scalars['ID']['input'];
};


export type MutationArchiveDataHubPipelineArgs = {
  id: Scalars['ID']['input'];
};


export type MutationAssignAssetsToChannelArgs = {
  input: AssignAssetsToChannelInput;
};


export type MutationAssignCollectionsToChannelArgs = {
  input: AssignCollectionsToChannelInput;
};


export type MutationAssignFacetsToChannelArgs = {
  input: AssignFacetsToChannelInput;
};


export type MutationAssignPaymentMethodsToChannelArgs = {
  input: AssignPaymentMethodsToChannelInput;
};


export type MutationAssignProductVariantsToChannelArgs = {
  input: AssignProductVariantsToChannelInput;
};


export type MutationAssignProductsToChannelArgs = {
  input: AssignProductsToChannelInput;
};


export type MutationAssignPromotionsToChannelArgs = {
  input: AssignPromotionsToChannelInput;
};


export type MutationAssignRoleToAdministratorArgs = {
  administratorId: Scalars['ID']['input'];
  roleId: Scalars['ID']['input'];
};


export type MutationAssignShippingMethodsToChannelArgs = {
  input: AssignShippingMethodsToChannelInput;
};


export type MutationAssignStockLocationsToChannelArgs = {
  input: AssignStockLocationsToChannelInput;
};


export type MutationAuthenticateArgs = {
  input: AuthenticationInput;
  rememberMe?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationCancelDataHubJobRunArgs = {
  id: Scalars['ID']['input'];
};


export type MutationCancelDataHubPipelineRunArgs = {
  id: Scalars['ID']['input'];
};


export type MutationCancelJobArgs = {
  jobId: Scalars['ID']['input'];
};


export type MutationCancelOrderArgs = {
  input: CancelOrderInput;
};


export type MutationCancelPaymentArgs = {
  id: Scalars['ID']['input'];
};


export type MutationCreateAdministratorArgs = {
  input: CreateAdministratorInput;
};


export type MutationCreateAssetsArgs = {
  input: Array<CreateAssetInput>;
};


export type MutationCreateChannelArgs = {
  input: CreateChannelInput;
};


export type MutationCreateCollectionArgs = {
  input: CreateCollectionInput;
};


export type MutationCreateCountryArgs = {
  input: CreateCountryInput;
};


export type MutationCreateCustomerArgs = {
  input: CreateCustomerInput;
  password?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateCustomerAddressArgs = {
  customerId: Scalars['ID']['input'];
  input: CreateAddressInput;
};


export type MutationCreateCustomerGroupArgs = {
  input: CreateCustomerGroupInput;
};


export type MutationCreateDataHubConnectionArgs = {
  input: CreateDataHubConnectionInput;
};


export type MutationCreateDataHubFeedArgs = {
  input: DataHubFeedInput;
};


export type MutationCreateDataHubJobArgs = {
  input: CreateDataHubJobInput;
};


export type MutationCreateDataHubPipelineArgs = {
  input: CreateDataHubPipelineInput;
};


export type MutationCreateDataHubSecretArgs = {
  input: CreateDataHubSecretInput;
};


export type MutationCreateFacetArgs = {
  input: CreateFacetInput;
};


export type MutationCreateFacetValueArgs = {
  input: CreateFacetValueInput;
};


export type MutationCreateFacetValuesArgs = {
  input: Array<CreateFacetValueInput>;
};


export type MutationCreatePaymentMethodArgs = {
  input: CreatePaymentMethodInput;
};


export type MutationCreateProductArgs = {
  input: CreateProductInput;
};


export type MutationCreateProductOptionArgs = {
  input: CreateProductOptionInput;
};


export type MutationCreateProductOptionGroupArgs = {
  input: CreateProductOptionGroupInput;
};


export type MutationCreateProductVariantsArgs = {
  input: Array<CreateProductVariantInput>;
};


export type MutationCreatePromotionArgs = {
  input: CreatePromotionInput;
};


export type MutationCreateProvinceArgs = {
  input: CreateProvinceInput;
};


export type MutationCreateRoleArgs = {
  input: CreateRoleInput;
};


export type MutationCreateSellerArgs = {
  input: CreateSellerInput;
};


export type MutationCreateShippingMethodArgs = {
  input: CreateShippingMethodInput;
};


export type MutationCreateStockLocationArgs = {
  input: CreateStockLocationInput;
};


export type MutationCreateTagArgs = {
  input: CreateTagInput;
};


export type MutationCreateTaxCategoryArgs = {
  input: CreateTaxCategoryInput;
};


export type MutationCreateTaxRateArgs = {
  input: CreateTaxRateInput;
};


export type MutationCreateZoneArgs = {
  input: CreateZoneInput;
};


export type MutationDataHubDeliverToDestinationArgs = {
  content: Scalars['String']['input'];
  destinationId: Scalars['String']['input'];
  filename: Scalars['String']['input'];
  mimeType?: InputMaybe<Scalars['String']['input']>;
};


export type MutationDataHubPruneDraftsArgs = {
  pipelineId: Scalars['ID']['input'];
};


export type MutationDataHubPublishVersionArgs = {
  input: DataHubPublishVersionInput;
};


export type MutationDataHubRegisterExportDestinationArgs = {
  input: DataHubExportDestinationInput;
};


export type MutationDataHubRemoveDeadLetterArgs = {
  deliveryId: Scalars['String']['input'];
};


export type MutationDataHubReplayStepArgs = {
  inputData: Array<Scalars['JSON']['input']>;
  options?: InputMaybe<DataHubSandboxOptions>;
  pipelineId: Scalars['ID']['input'];
  stepKey: Scalars['String']['input'];
};


export type MutationDataHubRestoreDraftArgs = {
  revisionId: Scalars['ID']['input'];
};


export type MutationDataHubRetryDeadLetterArgs = {
  deliveryId: Scalars['String']['input'];
};


export type MutationDataHubRevertToRevisionArgs = {
  input: DataHubRevertInput;
};


export type MutationDataHubSaveDraftArgs = {
  input: DataHubSaveDraftInput;
};


export type MutationDataHubTestExportDestinationArgs = {
  id: Scalars['String']['input'];
};


export type MutationDataHubTestWithSeedDataArgs = {
  options?: InputMaybe<DataHubSandboxOptions>;
  pipelineId: Scalars['ID']['input'];
  seedData: Array<Scalars['JSON']['input']>;
};


export type MutationDeleteAdministratorArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteAdministratorsArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDeleteAssetArgs = {
  input: DeleteAssetInput;
};


export type MutationDeleteAssetsArgs = {
  input: DeleteAssetsInput;
};


export type MutationDeleteChannelArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteChannelsArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDeleteCollectionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteCollectionsArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDeleteCountriesArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDeleteCountryArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteCustomerArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteCustomerAddressArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteCustomerGroupArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteCustomerGroupsArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDeleteCustomerNoteArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteCustomersArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDeleteDataHubConnectionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteDataHubJobArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteDataHubPipelineArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteDataHubSecretArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteDraftOrderArgs = {
  orderId: Scalars['ID']['input'];
};


export type MutationDeleteFacetArgs = {
  force?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
};


export type MutationDeleteFacetValuesArgs = {
  force?: InputMaybe<Scalars['Boolean']['input']>;
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDeleteFacetsArgs = {
  force?: InputMaybe<Scalars['Boolean']['input']>;
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDeleteOrderNoteArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeletePaymentMethodArgs = {
  force?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
};


export type MutationDeletePaymentMethodsArgs = {
  force?: InputMaybe<Scalars['Boolean']['input']>;
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDeleteProductArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteProductOptionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteProductVariantArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteProductVariantsArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDeleteProductsArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDeletePromotionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeletePromotionsArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDeleteProvinceArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteRoleArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteRolesArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDeleteSellerArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteSellersArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDeleteShippingMethodArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteShippingMethodsArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDeleteStockLocationArgs = {
  input: DeleteStockLocationInput;
};


export type MutationDeleteStockLocationsArgs = {
  input: Array<DeleteStockLocationInput>;
};


export type MutationDeleteTagArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteTaxCategoriesArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDeleteTaxCategoryArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteTaxRateArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteTaxRatesArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDeleteZoneArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteZonesArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDryRunDataHubJobArgs = {
  jobId: Scalars['ID']['input'];
  sampleData: Scalars['JSON']['input'];
};


export type MutationDuplicateDataHubJobArgs = {
  id: Scalars['ID']['input'];
  newCode: Scalars['String']['input'];
};


export type MutationDuplicateEntityArgs = {
  input: DuplicateEntityInput;
};


export type MutationFlushBufferedJobsArgs = {
  bufferIds?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type MutationGenerateDataHubFeedArgs = {
  feedCode: Scalars['String']['input'];
};


export type MutationImportProductsArgs = {
  csvFile: Scalars['Upload']['input'];
};


export type MutationLoginArgs = {
  password: Scalars['String']['input'];
  rememberMe?: InputMaybe<Scalars['Boolean']['input']>;
  username: Scalars['String']['input'];
};


export type MutationMarkDataHubDeadLetterArgs = {
  deadLetter: Scalars['Boolean']['input'];
  id: Scalars['ID']['input'];
};


export type MutationModifyOrderArgs = {
  input: ModifyOrderInput;
};


export type MutationMoveCollectionArgs = {
  input: MoveCollectionInput;
};


export type MutationPauseDataHubJobArgs = {
  id: Scalars['ID']['input'];
};


export type MutationPreviewDataHubExtractArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  step: Scalars['JSON']['input'];
};


export type MutationPreviewDataHubFeedArgs = {
  feedCode: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
};


export type MutationPreviewDataHubFileArgs = {
  input: DataHubFileUploadInput;
  targetEntity?: InputMaybe<Scalars['String']['input']>;
};


export type MutationPublishDataHubPipelineArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRefundOrderArgs = {
  input: RefundOrderInput;
};


export type MutationRejectDataHubGateArgs = {
  runId: Scalars['ID']['input'];
  stepKey: Scalars['String']['input'];
};


export type MutationRejectDataHubPipelineReviewArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRemoveCollectionsFromChannelArgs = {
  input: RemoveCollectionsFromChannelInput;
};


export type MutationRemoveCouponCodeFromDraftOrderArgs = {
  couponCode: Scalars['String']['input'];
  orderId: Scalars['ID']['input'];
};


export type MutationRemoveCustomersFromGroupArgs = {
  customerGroupId: Scalars['ID']['input'];
  customerIds: Array<Scalars['ID']['input']>;
};


export type MutationRemoveDraftOrderLineArgs = {
  orderId: Scalars['ID']['input'];
  orderLineId: Scalars['ID']['input'];
};


export type MutationRemoveFacetsFromChannelArgs = {
  input: RemoveFacetsFromChannelInput;
};


export type MutationRemoveMembersFromZoneArgs = {
  memberIds: Array<Scalars['ID']['input']>;
  zoneId: Scalars['ID']['input'];
};


export type MutationRemoveOptionGroupFromProductArgs = {
  force?: InputMaybe<Scalars['Boolean']['input']>;
  optionGroupId: Scalars['ID']['input'];
  productId: Scalars['ID']['input'];
};


export type MutationRemovePaymentMethodsFromChannelArgs = {
  input: RemovePaymentMethodsFromChannelInput;
};


export type MutationRemoveProductVariantsFromChannelArgs = {
  input: RemoveProductVariantsFromChannelInput;
};


export type MutationRemoveProductsFromChannelArgs = {
  input: RemoveProductsFromChannelInput;
};


export type MutationRemovePromotionsFromChannelArgs = {
  input: RemovePromotionsFromChannelInput;
};


export type MutationRemoveSettledJobsArgs = {
  olderThan?: InputMaybe<Scalars['DateTime']['input']>;
  queueNames?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type MutationRemoveShippingMethodsFromChannelArgs = {
  input: RemoveShippingMethodsFromChannelInput;
};


export type MutationRemoveStockLocationsFromChannelArgs = {
  input: RemoveStockLocationsFromChannelInput;
};


export type MutationResetDataHubAutoMapperConfigArgs = {
  pipelineId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationRetryDataHubRecordArgs = {
  errorId: Scalars['ID']['input'];
  patch?: InputMaybe<Scalars['JSON']['input']>;
};


export type MutationRevertDataHubPipelineToRevisionArgs = {
  revisionId: Scalars['ID']['input'];
};


export type MutationRunDataHubHookTestArgs = {
  payload?: InputMaybe<Scalars['JSON']['input']>;
  pipelineId: Scalars['ID']['input'];
  stage: Scalars['String']['input'];
};


export type MutationRunScheduledTaskArgs = {
  id: Scalars['String']['input'];
};


export type MutationSetCustomerForDraftOrderArgs = {
  customerId?: InputMaybe<Scalars['ID']['input']>;
  input?: InputMaybe<CreateCustomerInput>;
  orderId: Scalars['ID']['input'];
};


export type MutationSetDraftOrderBillingAddressArgs = {
  input: CreateAddressInput;
  orderId: Scalars['ID']['input'];
};


export type MutationSetDraftOrderCustomFieldsArgs = {
  input: UpdateOrderInput;
  orderId: Scalars['ID']['input'];
};


export type MutationSetDraftOrderShippingAddressArgs = {
  input: CreateAddressInput;
  orderId: Scalars['ID']['input'];
};


export type MutationSetDraftOrderShippingMethodArgs = {
  orderId: Scalars['ID']['input'];
  shippingMethodId: Scalars['ID']['input'];
};


export type MutationSetOrderCustomFieldsArgs = {
  input: UpdateOrderInput;
};


export type MutationSetOrderCustomerArgs = {
  input: SetOrderCustomerInput;
};


export type MutationSetSettingsStoreValueArgs = {
  input: SettingsStoreInput;
};


export type MutationSetSettingsStoreValuesArgs = {
  inputs: Array<SettingsStoreInput>;
};


export type MutationSettlePaymentArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSettleRefundArgs = {
  input: SettleRefundInput;
};


export type MutationSimulateDataHubLoadArgs = {
  records: Scalars['JSON']['input'];
  step: Scalars['JSON']['input'];
};


export type MutationSimulateDataHubTransformArgs = {
  records: Scalars['JSON']['input'];
  step: Scalars['JSON']['input'];
};


export type MutationSimulateDataHubValidateArgs = {
  records: Scalars['JSON']['input'];
  step: Scalars['JSON']['input'];
};


export type MutationStartDataHubConsumerArgs = {
  pipelineCode: Scalars['String']['input'];
};


export type MutationStartDataHubJobRunArgs = {
  inputFileId?: InputMaybe<Scalars['String']['input']>;
  inputFileName?: InputMaybe<Scalars['String']['input']>;
  jobId: Scalars['ID']['input'];
};


export type MutationStartDataHubPipelineDryRunArgs = {
  pipelineId: Scalars['ID']['input'];
};


export type MutationStartDataHubPipelineRunArgs = {
  pipelineId: Scalars['ID']['input'];
};


export type MutationStopDataHubConsumerArgs = {
  pipelineCode: Scalars['String']['input'];
};


export type MutationSubmitDataHubPipelineForReviewArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSuggestDataHubMappingsArgs = {
  sourceFields: Array<DataHubSourceFieldInput>;
  targetEntity: Scalars['String']['input'];
};


export type MutationTransitionFulfillmentToStateArgs = {
  id: Scalars['ID']['input'];
  state: Scalars['String']['input'];
};


export type MutationTransitionOrderToStateArgs = {
  id: Scalars['ID']['input'];
  state: Scalars['String']['input'];
};


export type MutationTransitionPaymentToStateArgs = {
  id: Scalars['ID']['input'];
  state: Scalars['String']['input'];
};


export type MutationUnsetDraftOrderBillingAddressArgs = {
  orderId: Scalars['ID']['input'];
};


export type MutationUnsetDraftOrderShippingAddressArgs = {
  orderId: Scalars['ID']['input'];
};


export type MutationUpdateActiveAdministratorArgs = {
  input: UpdateActiveAdministratorInput;
};


export type MutationUpdateAdministratorArgs = {
  input: UpdateAdministratorInput;
};


export type MutationUpdateAssetArgs = {
  input: UpdateAssetInput;
};


export type MutationUpdateChannelArgs = {
  input: UpdateChannelInput;
};


export type MutationUpdateCollectionArgs = {
  input: UpdateCollectionInput;
};


export type MutationUpdateCountryArgs = {
  input: UpdateCountryInput;
};


export type MutationUpdateCustomerArgs = {
  input: UpdateCustomerInput;
};


export type MutationUpdateCustomerAddressArgs = {
  input: UpdateAddressInput;
};


export type MutationUpdateCustomerGroupArgs = {
  input: UpdateCustomerGroupInput;
};


export type MutationUpdateCustomerNoteArgs = {
  input: UpdateCustomerNoteInput;
};


export type MutationUpdateDataHubAutoMapperConfigArgs = {
  input: DataHubAutoMapperConfigInput;
};


export type MutationUpdateDataHubCheckpointArgs = {
  data: Scalars['JSON']['input'];
  pipelineId: Scalars['ID']['input'];
};


export type MutationUpdateDataHubConnectionArgs = {
  input: UpdateDataHubConnectionInput;
};


export type MutationUpdateDataHubJobArgs = {
  input: UpdateDataHubJobInput;
};


export type MutationUpdateDataHubPipelineArgs = {
  input: UpdateDataHubPipelineInput;
};


export type MutationUpdateDataHubSecretArgs = {
  input: UpdateDataHubSecretInput;
};


export type MutationUpdateDataHubSettingsArgs = {
  input: DataHubSettingsInput;
};


export type MutationUpdateFacetArgs = {
  input: UpdateFacetInput;
};


export type MutationUpdateFacetValueArgs = {
  input: UpdateFacetValueInput;
};


export type MutationUpdateFacetValuesArgs = {
  input: Array<UpdateFacetValueInput>;
};


export type MutationUpdateGlobalSettingsArgs = {
  input: UpdateGlobalSettingsInput;
};


export type MutationUpdateOrderNoteArgs = {
  input: UpdateOrderNoteInput;
};


export type MutationUpdatePaymentMethodArgs = {
  input: UpdatePaymentMethodInput;
};


export type MutationUpdateProductArgs = {
  input: UpdateProductInput;
};


export type MutationUpdateProductOptionArgs = {
  input: UpdateProductOptionInput;
};


export type MutationUpdateProductOptionGroupArgs = {
  input: UpdateProductOptionGroupInput;
};


export type MutationUpdateProductVariantArgs = {
  input: UpdateProductVariantInput;
};


export type MutationUpdateProductVariantsArgs = {
  input: Array<UpdateProductVariantInput>;
};


export type MutationUpdateProductsArgs = {
  input: Array<UpdateProductInput>;
};


export type MutationUpdatePromotionArgs = {
  input: UpdatePromotionInput;
};


export type MutationUpdateProvinceArgs = {
  input: UpdateProvinceInput;
};


export type MutationUpdateRoleArgs = {
  input: UpdateRoleInput;
};


export type MutationUpdateScheduledTaskArgs = {
  input: UpdateScheduledTaskInput;
};


export type MutationUpdateSellerArgs = {
  input: UpdateSellerInput;
};


export type MutationUpdateShippingMethodArgs = {
  input: UpdateShippingMethodInput;
};


export type MutationUpdateStockLocationArgs = {
  input: UpdateStockLocationInput;
};


export type MutationUpdateTagArgs = {
  input: UpdateTagInput;
};


export type MutationUpdateTaxCategoryArgs = {
  input: UpdateTaxCategoryInput;
};


export type MutationUpdateTaxRateArgs = {
  input: UpdateTaxRateInput;
};


export type MutationUpdateZoneArgs = {
  input: UpdateZoneInput;
};


export type MutationValidateDataHubMappingsArgs = {
  mappings: Scalars['JSON']['input'];
  targetEntity: Scalars['String']['input'];
};

export type NativeAuthInput = {
  password: Scalars['String']['input'];
  username: Scalars['String']['input'];
};

/** Returned when attempting an operation that relies on the NativeAuthStrategy, if that strategy is not configured. */
export type NativeAuthStrategyError = ErrorResult & {
  __typename?: 'NativeAuthStrategyError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type NativeAuthenticationResult = CurrentUser | InvalidCredentialsError | NativeAuthStrategyError;

/** Returned when attempting to set a negative OrderLine quantity. */
export type NegativeQuantityError = ErrorResult & {
  __typename?: 'NegativeQuantityError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/**
 * Returned when invoking a mutation which depends on there being an active Order on the
 * current session.
 */
export type NoActiveOrderError = ErrorResult & {
  __typename?: 'NoActiveOrderError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/** Returned when a call to modifyOrder fails to specify any changes */
export type NoChangesSpecifiedError = ErrorResult & {
  __typename?: 'NoChangesSpecifiedError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type Node = {
  id: Scalars['ID']['output'];
};

/** Returned if an attempting to refund an Order but neither items nor shipping refund was specified */
export type NothingToRefundError = ErrorResult & {
  __typename?: 'NothingToRefundError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/** Operators for filtering on a list of Number fields */
export type NumberListOperators = {
  inList: Scalars['Float']['input'];
};

/** Operators for filtering on a Int or Float field */
export type NumberOperators = {
  between?: InputMaybe<NumberRange>;
  eq?: InputMaybe<Scalars['Float']['input']>;
  gt?: InputMaybe<Scalars['Float']['input']>;
  gte?: InputMaybe<Scalars['Float']['input']>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  lt?: InputMaybe<Scalars['Float']['input']>;
  lte?: InputMaybe<Scalars['Float']['input']>;
};

export type NumberRange = {
  end: Scalars['Float']['input'];
  start: Scalars['Float']['input'];
};

export type Order = Node & {
  __typename?: 'Order';
  /** An order is active as long as the payment process has not been completed */
  active: Scalars['Boolean']['output'];
  aggregateOrder?: Maybe<Order>;
  aggregateOrderId?: Maybe<Scalars['ID']['output']>;
  billingAddress?: Maybe<OrderAddress>;
  channels: Array<Channel>;
  /** A unique code for the Order */
  code: Scalars['String']['output'];
  /** An array of all coupon codes applied to the Order */
  couponCodes: Array<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  currencyCode: CurrencyCode;
  customFields?: Maybe<Scalars['JSON']['output']>;
  customer?: Maybe<Customer>;
  discounts: Array<Discount>;
  fulfillments?: Maybe<Array<Fulfillment>>;
  history: HistoryEntryList;
  id: Scalars['ID']['output'];
  lines: Array<OrderLine>;
  modifications: Array<OrderModification>;
  nextStates: Array<Scalars['String']['output']>;
  /**
   * The date & time that the Order was placed, i.e. the Customer
   * completed the checkout and the Order is no longer "active"
   */
  orderPlacedAt?: Maybe<Scalars['DateTime']['output']>;
  payments?: Maybe<Array<Payment>>;
  /** Promotions applied to the order. Only gets populated after the payment process has completed. */
  promotions: Array<Promotion>;
  sellerOrders?: Maybe<Array<Order>>;
  shipping: Scalars['Money']['output'];
  shippingAddress?: Maybe<OrderAddress>;
  shippingLines: Array<ShippingLine>;
  shippingWithTax: Scalars['Money']['output'];
  state: Scalars['String']['output'];
  /**
   * The subTotal is the total of all OrderLines in the Order. This figure also includes any Order-level
   * discounts which have been prorated (proportionally distributed) amongst the items of each OrderLine.
   * To get a total of all OrderLines which does not account for prorated discounts, use the
   * sum of `OrderLine.discountedLinePrice` values.
   */
  subTotal: Scalars['Money']['output'];
  /** Same as subTotal, but inclusive of tax */
  subTotalWithTax: Scalars['Money']['output'];
  /**
   * Surcharges are arbitrary modifications to the Order total which are neither
   * ProductVariants nor discounts resulting from applied Promotions. For example,
   * one-off discounts based on customer interaction, or surcharges based on payment
   * methods.
   */
  surcharges: Array<Surcharge>;
  /** A summary of the taxes being applied to this Order */
  taxSummary: Array<OrderTaxSummary>;
  /** Equal to subTotal plus shipping */
  total: Scalars['Money']['output'];
  totalQuantity: Scalars['Int']['output'];
  /** The final payable amount. Equal to subTotalWithTax plus shippingWithTax */
  totalWithTax: Scalars['Money']['output'];
  type: OrderType;
  updatedAt: Scalars['DateTime']['output'];
};


export type OrderHistoryArgs = {
  options?: InputMaybe<HistoryEntryListOptions>;
};

export type OrderAddress = {
  __typename?: 'OrderAddress';
  city?: Maybe<Scalars['String']['output']>;
  company?: Maybe<Scalars['String']['output']>;
  country?: Maybe<Scalars['String']['output']>;
  countryCode?: Maybe<Scalars['String']['output']>;
  customFields?: Maybe<Scalars['JSON']['output']>;
  fullName?: Maybe<Scalars['String']['output']>;
  phoneNumber?: Maybe<Scalars['String']['output']>;
  postalCode?: Maybe<Scalars['String']['output']>;
  province?: Maybe<Scalars['String']['output']>;
  streetLine1?: Maybe<Scalars['String']['output']>;
  streetLine2?: Maybe<Scalars['String']['output']>;
};

export type OrderFilterParameter = {
  _and?: InputMaybe<Array<OrderFilterParameter>>;
  _or?: InputMaybe<Array<OrderFilterParameter>>;
  active?: InputMaybe<BooleanOperators>;
  aggregateOrderId?: InputMaybe<IdOperators>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  currencyCode?: InputMaybe<StringOperators>;
  customerLastName?: InputMaybe<StringOperators>;
  id?: InputMaybe<IdOperators>;
  orderPlacedAt?: InputMaybe<DateOperators>;
  shipping?: InputMaybe<NumberOperators>;
  shippingWithTax?: InputMaybe<NumberOperators>;
  state?: InputMaybe<StringOperators>;
  subTotal?: InputMaybe<NumberOperators>;
  subTotalWithTax?: InputMaybe<NumberOperators>;
  total?: InputMaybe<NumberOperators>;
  totalQuantity?: InputMaybe<NumberOperators>;
  totalWithTax?: InputMaybe<NumberOperators>;
  transactionId?: InputMaybe<StringOperators>;
  type?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

/** Returned when an order operation is rejected by an OrderInterceptor method. */
export type OrderInterceptorError = ErrorResult & {
  __typename?: 'OrderInterceptorError';
  errorCode: ErrorCode;
  interceptorError: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

/** Returned when the maximum order size limit has been reached. */
export type OrderLimitError = ErrorResult & {
  __typename?: 'OrderLimitError';
  errorCode: ErrorCode;
  maxItems: Scalars['Int']['output'];
  message: Scalars['String']['output'];
};

export type OrderLine = Node & {
  __typename?: 'OrderLine';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  /** The price of the line including discounts, excluding tax */
  discountedLinePrice: Scalars['Money']['output'];
  /** The price of the line including discounts and tax */
  discountedLinePriceWithTax: Scalars['Money']['output'];
  /**
   * The price of a single unit including discounts, excluding tax.
   *
   * If Order-level discounts have been applied, this will not be the
   * actual taxable unit price (see `proratedUnitPrice`), but is generally the
   * correct price to display to customers to avoid confusion
   * about the internal handling of distributed Order-level discounts.
   */
  discountedUnitPrice: Scalars['Money']['output'];
  /** The price of a single unit including discounts and tax */
  discountedUnitPriceWithTax: Scalars['Money']['output'];
  discounts: Array<Discount>;
  featuredAsset?: Maybe<Asset>;
  fulfillmentLines?: Maybe<Array<FulfillmentLine>>;
  id: Scalars['ID']['output'];
  /** The total price of the line excluding tax and discounts. */
  linePrice: Scalars['Money']['output'];
  /** The total price of the line including tax but excluding discounts. */
  linePriceWithTax: Scalars['Money']['output'];
  /** The total tax on this line */
  lineTax: Scalars['Money']['output'];
  order: Order;
  /** The quantity at the time the Order was placed */
  orderPlacedQuantity: Scalars['Int']['output'];
  productVariant: ProductVariant;
  /**
   * The actual line price, taking into account both item discounts _and_ prorated (proportionally-distributed)
   * Order-level discounts. This value is the true economic value of the OrderLine, and is used in tax
   * and refund calculations.
   */
  proratedLinePrice: Scalars['Money']['output'];
  /** The proratedLinePrice including tax */
  proratedLinePriceWithTax: Scalars['Money']['output'];
  /**
   * The actual unit price, taking into account both item discounts _and_ prorated (proportionally-distributed)
   * Order-level discounts. This value is the true economic value of the OrderItem, and is used in tax
   * and refund calculations.
   */
  proratedUnitPrice: Scalars['Money']['output'];
  /** The proratedUnitPrice including tax */
  proratedUnitPriceWithTax: Scalars['Money']['output'];
  /** The quantity of items purchased */
  quantity: Scalars['Int']['output'];
  taxLines: Array<TaxLine>;
  taxRate: Scalars['Float']['output'];
  /** The price of a single unit, excluding tax and discounts */
  unitPrice: Scalars['Money']['output'];
  /** Non-zero if the unitPrice has changed since it was initially added to Order */
  unitPriceChangeSinceAdded: Scalars['Money']['output'];
  /** The price of a single unit, including tax but excluding discounts */
  unitPriceWithTax: Scalars['Money']['output'];
  /** Non-zero if the unitPriceWithTax has changed since it was initially added to Order */
  unitPriceWithTaxChangeSinceAdded: Scalars['Money']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type OrderLineInput = {
  orderLineId: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
};

export type OrderList = PaginatedList & {
  __typename?: 'OrderList';
  items: Array<Order>;
  totalItems: Scalars['Int']['output'];
};

export type OrderListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<OrderFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<OrderSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type OrderModification = Node & {
  __typename?: 'OrderModification';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  isSettled: Scalars['Boolean']['output'];
  lines: Array<OrderModificationLine>;
  note: Scalars['String']['output'];
  payment?: Maybe<Payment>;
  priceChange: Scalars['Money']['output'];
  refund?: Maybe<Refund>;
  surcharges?: Maybe<Array<Surcharge>>;
  updatedAt: Scalars['DateTime']['output'];
};

/** Returned when attempting to modify the contents of an Order that is not in the `AddingItems` state. */
export type OrderModificationError = ErrorResult & {
  __typename?: 'OrderModificationError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type OrderModificationLine = {
  __typename?: 'OrderModificationLine';
  modification: OrderModification;
  modificationId: Scalars['ID']['output'];
  orderLine: OrderLine;
  orderLineId: Scalars['ID']['output'];
  quantity: Scalars['Int']['output'];
};

/** Returned when attempting to modify the contents of an Order that is not in the `Modifying` state. */
export type OrderModificationStateError = ErrorResult & {
  __typename?: 'OrderModificationStateError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type OrderProcessState = {
  __typename?: 'OrderProcessState';
  name: Scalars['String']['output'];
  to: Array<Scalars['String']['output']>;
};

export type OrderSortParameter = {
  aggregateOrderId?: InputMaybe<SortOrder>;
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  customerLastName?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  orderPlacedAt?: InputMaybe<SortOrder>;
  shipping?: InputMaybe<SortOrder>;
  shippingWithTax?: InputMaybe<SortOrder>;
  state?: InputMaybe<SortOrder>;
  subTotal?: InputMaybe<SortOrder>;
  subTotalWithTax?: InputMaybe<SortOrder>;
  total?: InputMaybe<SortOrder>;
  totalQuantity?: InputMaybe<SortOrder>;
  totalWithTax?: InputMaybe<SortOrder>;
  transactionId?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

/** Returned if there is an error in transitioning the Order state */
export type OrderStateTransitionError = ErrorResult & {
  __typename?: 'OrderStateTransitionError';
  errorCode: ErrorCode;
  fromState: Scalars['String']['output'];
  message: Scalars['String']['output'];
  toState: Scalars['String']['output'];
  transitionError: Scalars['String']['output'];
};

/**
 * A summary of the taxes being applied to this order, grouped
 * by taxRate.
 */
export type OrderTaxSummary = {
  __typename?: 'OrderTaxSummary';
  /** A description of this tax */
  description: Scalars['String']['output'];
  /** The total net price of OrderLines to which this taxRate applies */
  taxBase: Scalars['Money']['output'];
  /** The taxRate as a percentage */
  taxRate: Scalars['Float']['output'];
  /** The total tax being applied to the Order at this taxRate */
  taxTotal: Scalars['Money']['output'];
};

export enum OrderType {
  Aggregate = 'Aggregate',
  Regular = 'Regular',
  Seller = 'Seller'
}

export type PaginatedList = {
  items: Array<Node>;
  totalItems: Scalars['Int']['output'];
};

export type Payment = Node & {
  __typename?: 'Payment';
  amount: Scalars['Money']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  errorMessage?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  metadata?: Maybe<Scalars['JSON']['output']>;
  method: Scalars['String']['output'];
  nextStates: Array<Scalars['String']['output']>;
  refunds: Array<Refund>;
  state: Scalars['String']['output'];
  transactionId?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type PaymentMethod = Node & {
  __typename?: 'PaymentMethod';
  checker?: Maybe<ConfigurableOperation>;
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  description: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  handler: ConfigurableOperation;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  translations: Array<PaymentMethodTranslation>;
  updatedAt: Scalars['DateTime']['output'];
};

export type PaymentMethodFilterParameter = {
  _and?: InputMaybe<Array<PaymentMethodFilterParameter>>;
  _or?: InputMaybe<Array<PaymentMethodFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  description?: InputMaybe<StringOperators>;
  enabled?: InputMaybe<BooleanOperators>;
  id?: InputMaybe<IdOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type PaymentMethodList = PaginatedList & {
  __typename?: 'PaymentMethodList';
  items: Array<PaymentMethod>;
  totalItems: Scalars['Int']['output'];
};

export type PaymentMethodListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<PaymentMethodFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<PaymentMethodSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

/**
 * Returned when a call to modifyOrder fails to include a paymentMethod even
 * though the price has increased as a result of the changes.
 */
export type PaymentMethodMissingError = ErrorResult & {
  __typename?: 'PaymentMethodMissingError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type PaymentMethodQuote = {
  __typename?: 'PaymentMethodQuote';
  code: Scalars['String']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  description: Scalars['String']['output'];
  eligibilityMessage?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isEligible: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
};

export type PaymentMethodSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type PaymentMethodTranslation = {
  __typename?: 'PaymentMethodTranslation';
  createdAt: Scalars['DateTime']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type PaymentMethodTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

/** Returned if an attempting to refund a Payment against OrderLines from a different Order */
export type PaymentOrderMismatchError = ErrorResult & {
  __typename?: 'PaymentOrderMismatchError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/** Returned when there is an error in transitioning the Payment state */
export type PaymentStateTransitionError = ErrorResult & {
  __typename?: 'PaymentStateTransitionError';
  errorCode: ErrorCode;
  fromState: Scalars['String']['output'];
  message: Scalars['String']['output'];
  toState: Scalars['String']['output'];
  transitionError: Scalars['String']['output'];
};

/**
 * @description
 * Permissions for administrators and customers. Used to control access to
 * GraphQL resolvers via the {@link Allow} decorator.
 *
 * ## Understanding Permission.Owner
 *
 * `Permission.Owner` is a special permission which is used in some Vendure resolvers to indicate that that resolver should only
 * be accessible to the "owner" of that resource.
 *
 * For example, the Shop API `activeCustomer` query resolver should only return the Customer object for the "owner" of that Customer, i.e.
 * based on the activeUserId of the current session. As a result, the resolver code looks like this:
 *
 * @example
 * ```TypeScript
 * \@Query()
 * \@Allow(Permission.Owner)
 * async activeCustomer(\@Ctx() ctx: RequestContext): Promise<Customer | undefined> {
 *   const userId = ctx.activeUserId;
 *   if (userId) {
 *     return this.customerService.findOneByUserId(ctx, userId);
 *   }
 * }
 * ```
 *
 * Here we can see that the "ownership" must be enforced by custom logic inside the resolver. Since "ownership" cannot be defined generally
 * nor statically encoded at build-time, any resolvers using `Permission.Owner` **must** include logic to enforce that only the owner
 * of the resource has access. If not, then it is the equivalent of using `Permission.Public`.
 *
 *
 * @docsCategory common
 */
export enum Permission {
  /** Authenticated means simply that the user is logged in */
  Authenticated = 'Authenticated',
  /** Grants permission to create Administrator */
  CreateAdministrator = 'CreateAdministrator',
  /** Grants permission to create Asset */
  CreateAsset = 'CreateAsset',
  /** Grants permission to create Products, Facets, Assets, Collections */
  CreateCatalog = 'CreateCatalog',
  /** Grants permission to create Channel */
  CreateChannel = 'CreateChannel',
  /** Grants permission to create Collection */
  CreateCollection = 'CreateCollection',
  /** Grants permission to create Country */
  CreateCountry = 'CreateCountry',
  /** Grants permission to create Customer */
  CreateCustomer = 'CreateCustomer',
  /** Grants permission to create CustomerGroup */
  CreateCustomerGroup = 'CreateCustomerGroup',
  /** Grants permission to create DataHubPipeline */
  CreateDataHubPipeline = 'CreateDataHubPipeline',
  /** Grants permission to create DataHubSecret */
  CreateDataHubSecret = 'CreateDataHubSecret',
  /** Grants permission to create Facet */
  CreateFacet = 'CreateFacet',
  /** Grants permission to create Order */
  CreateOrder = 'CreateOrder',
  /** Grants permission to create PaymentMethod */
  CreatePaymentMethod = 'CreatePaymentMethod',
  /** Grants permission to create Product */
  CreateProduct = 'CreateProduct',
  /** Grants permission to create Promotion */
  CreatePromotion = 'CreatePromotion',
  /** Grants permission to create Seller */
  CreateSeller = 'CreateSeller',
  /** Grants permission to create PaymentMethods, ShippingMethods, TaxCategories, TaxRates, Zones, Countries, System & GlobalSettings */
  CreateSettings = 'CreateSettings',
  /** Grants permission to create ShippingMethod */
  CreateShippingMethod = 'CreateShippingMethod',
  /** Grants permission to create StockLocation */
  CreateStockLocation = 'CreateStockLocation',
  /** Grants permission to create System */
  CreateSystem = 'CreateSystem',
  /** Grants permission to create Tag */
  CreateTag = 'CreateTag',
  /** Grants permission to create TaxCategory */
  CreateTaxCategory = 'CreateTaxCategory',
  /** Grants permission to create TaxRate */
  CreateTaxRate = 'CreateTaxRate',
  /** Grants permission to create Zone */
  CreateZone = 'CreateZone',
  /** Grants permission to delete Administrator */
  DeleteAdministrator = 'DeleteAdministrator',
  /** Grants permission to delete Asset */
  DeleteAsset = 'DeleteAsset',
  /** Grants permission to delete Products, Facets, Assets, Collections */
  DeleteCatalog = 'DeleteCatalog',
  /** Grants permission to delete Channel */
  DeleteChannel = 'DeleteChannel',
  /** Grants permission to delete Collection */
  DeleteCollection = 'DeleteCollection',
  /** Grants permission to delete Country */
  DeleteCountry = 'DeleteCountry',
  /** Grants permission to delete Customer */
  DeleteCustomer = 'DeleteCustomer',
  /** Grants permission to delete CustomerGroup */
  DeleteCustomerGroup = 'DeleteCustomerGroup',
  /** Grants permission to delete DataHubPipeline */
  DeleteDataHubPipeline = 'DeleteDataHubPipeline',
  /** Grants permission to delete DataHubSecret */
  DeleteDataHubSecret = 'DeleteDataHubSecret',
  /** Grants permission to delete Facet */
  DeleteFacet = 'DeleteFacet',
  /** Grants permission to delete Order */
  DeleteOrder = 'DeleteOrder',
  /** Grants permission to delete PaymentMethod */
  DeletePaymentMethod = 'DeletePaymentMethod',
  /** Grants permission to delete Product */
  DeleteProduct = 'DeleteProduct',
  /** Grants permission to delete Promotion */
  DeletePromotion = 'DeletePromotion',
  /** Grants permission to delete Seller */
  DeleteSeller = 'DeleteSeller',
  /** Grants permission to delete PaymentMethods, ShippingMethods, TaxCategories, TaxRates, Zones, Countries, System & GlobalSettings */
  DeleteSettings = 'DeleteSettings',
  /** Grants permission to delete ShippingMethod */
  DeleteShippingMethod = 'DeleteShippingMethod',
  /** Grants permission to delete StockLocation */
  DeleteStockLocation = 'DeleteStockLocation',
  /** Grants permission to delete System */
  DeleteSystem = 'DeleteSystem',
  /** Grants permission to delete Tag */
  DeleteTag = 'DeleteTag',
  /** Grants permission to delete TaxCategory */
  DeleteTaxCategory = 'DeleteTaxCategory',
  /** Grants permission to delete TaxRate */
  DeleteTaxRate = 'DeleteTaxRate',
  /** Grants permission to delete Zone */
  DeleteZone = 'DeleteZone',
  /** Grants permissions on EditDataHubQuarantine operations */
  EditDataHubQuarantine = 'EditDataHubQuarantine',
  /** Grants permissions on ManageDataHubAdapters operations */
  ManageDataHubAdapters = 'ManageDataHubAdapters',
  /** Grants permissions on ManageDataHubConnections operations */
  ManageDataHubConnections = 'ManageDataHubConnections',
  /** Grants permissions on ManageDataHubDestinations operations */
  ManageDataHubDestinations = 'ManageDataHubDestinations',
  /** Grants permissions on ManageDataHubFeeds operations */
  ManageDataHubFeeds = 'ManageDataHubFeeds',
  /** Grants permissions on ManageDataHubFiles operations */
  ManageDataHubFiles = 'ManageDataHubFiles',
  /** Grants permissions on ManageDataHubWebhooks operations */
  ManageDataHubWebhooks = 'ManageDataHubWebhooks',
  /** Owner means the user owns this entity, e.g. a Customer's own Order */
  Owner = 'Owner',
  /** Public means any unauthenticated user may perform the operation */
  Public = 'Public',
  /** Grants permissions on PublishDataHubPipeline operations */
  PublishDataHubPipeline = 'PublishDataHubPipeline',
  /** Grants permission to read Administrator */
  ReadAdministrator = 'ReadAdministrator',
  /** Grants permission to read Asset */
  ReadAsset = 'ReadAsset',
  /** Grants permission to read Products, Facets, Assets, Collections */
  ReadCatalog = 'ReadCatalog',
  /** Grants permission to read Channel */
  ReadChannel = 'ReadChannel',
  /** Grants permission to read Collection */
  ReadCollection = 'ReadCollection',
  /** Grants permission to read Country */
  ReadCountry = 'ReadCountry',
  /** Grants permission to read Customer */
  ReadCustomer = 'ReadCustomer',
  /** Grants permission to read CustomerGroup */
  ReadCustomerGroup = 'ReadCustomerGroup',
  /** Grants permission to read DashboardGlobalViews */
  ReadDashboardGlobalViews = 'ReadDashboardGlobalViews',
  /** Grants permissions on ReadDataHubFiles operations */
  ReadDataHubFiles = 'ReadDataHubFiles',
  /** Grants permission to read DataHubPipeline */
  ReadDataHubPipeline = 'ReadDataHubPipeline',
  /** Grants permission to read DataHubSecret */
  ReadDataHubSecret = 'ReadDataHubSecret',
  /** Grants permission to read Facet */
  ReadFacet = 'ReadFacet',
  /** Grants permission to read Order */
  ReadOrder = 'ReadOrder',
  /** Grants permission to read PaymentMethod */
  ReadPaymentMethod = 'ReadPaymentMethod',
  /** Grants permission to read Product */
  ReadProduct = 'ReadProduct',
  /** Grants permission to read Promotion */
  ReadPromotion = 'ReadPromotion',
  /** Grants permission to read Seller */
  ReadSeller = 'ReadSeller',
  /** Grants permission to read PaymentMethods, ShippingMethods, TaxCategories, TaxRates, Zones, Countries, System & GlobalSettings */
  ReadSettings = 'ReadSettings',
  /** Grants permission to read ShippingMethod */
  ReadShippingMethod = 'ReadShippingMethod',
  /** Grants permission to read StockLocation */
  ReadStockLocation = 'ReadStockLocation',
  /** Grants permission to read System */
  ReadSystem = 'ReadSystem',
  /** Grants permission to read Tag */
  ReadTag = 'ReadTag',
  /** Grants permission to read TaxCategory */
  ReadTaxCategory = 'ReadTaxCategory',
  /** Grants permission to read TaxRate */
  ReadTaxRate = 'ReadTaxRate',
  /** Grants permission to read Zone */
  ReadZone = 'ReadZone',
  /** Grants permissions on ReplayDataHubRecord operations */
  ReplayDataHubRecord = 'ReplayDataHubRecord',
  /** Grants permissions on RetryDataHubRecord operations */
  RetryDataHubRecord = 'RetryDataHubRecord',
  /** Grants permissions on ReviewDataHubPipeline operations */
  ReviewDataHubPipeline = 'ReviewDataHubPipeline',
  /** Grants permissions on RunDataHubPipeline operations */
  RunDataHubPipeline = 'RunDataHubPipeline',
  /** Grants permissions on SubscribeDataHubEvents operations */
  SubscribeDataHubEvents = 'SubscribeDataHubEvents',
  /** SuperAdmin has unrestricted access to all operations */
  SuperAdmin = 'SuperAdmin',
  /** Grants permission to update Administrator */
  UpdateAdministrator = 'UpdateAdministrator',
  /** Grants permission to update Asset */
  UpdateAsset = 'UpdateAsset',
  /** Grants permission to update Products, Facets, Assets, Collections */
  UpdateCatalog = 'UpdateCatalog',
  /** Grants permission to update Channel */
  UpdateChannel = 'UpdateChannel',
  /** Grants permission to update Collection */
  UpdateCollection = 'UpdateCollection',
  /** Grants permission to update Country */
  UpdateCountry = 'UpdateCountry',
  /** Grants permission to update Customer */
  UpdateCustomer = 'UpdateCustomer',
  /** Grants permission to update CustomerGroup */
  UpdateCustomerGroup = 'UpdateCustomerGroup',
  /** Grants permission to update DataHubPipeline */
  UpdateDataHubPipeline = 'UpdateDataHubPipeline',
  /** Grants permission to update DataHubSecret */
  UpdateDataHubSecret = 'UpdateDataHubSecret',
  /** Grants permissions on UpdateDataHubSettings operations */
  UpdateDataHubSettings = 'UpdateDataHubSettings',
  /** Grants permission to update Facet */
  UpdateFacet = 'UpdateFacet',
  /** Grants permission to update GlobalSettings */
  UpdateGlobalSettings = 'UpdateGlobalSettings',
  /** Grants permission to update Order */
  UpdateOrder = 'UpdateOrder',
  /** Grants permission to update PaymentMethod */
  UpdatePaymentMethod = 'UpdatePaymentMethod',
  /** Grants permission to update Product */
  UpdateProduct = 'UpdateProduct',
  /** Grants permission to update Promotion */
  UpdatePromotion = 'UpdatePromotion',
  /** Grants permission to update Seller */
  UpdateSeller = 'UpdateSeller',
  /** Grants permission to update PaymentMethods, ShippingMethods, TaxCategories, TaxRates, Zones, Countries, System & GlobalSettings */
  UpdateSettings = 'UpdateSettings',
  /** Grants permission to update ShippingMethod */
  UpdateShippingMethod = 'UpdateShippingMethod',
  /** Grants permission to update StockLocation */
  UpdateStockLocation = 'UpdateStockLocation',
  /** Grants permission to update System */
  UpdateSystem = 'UpdateSystem',
  /** Grants permission to update Tag */
  UpdateTag = 'UpdateTag',
  /** Grants permission to update TaxCategory */
  UpdateTaxCategory = 'UpdateTaxCategory',
  /** Grants permission to update TaxRate */
  UpdateTaxRate = 'UpdateTaxRate',
  /** Grants permission to update Zone */
  UpdateZone = 'UpdateZone',
  /** Grants permissions on ViewDataHubAnalytics operations */
  ViewDataHubAnalytics = 'ViewDataHubAnalytics',
  /** Grants permissions on ViewDataHubEntitySchemas operations */
  ViewDataHubEntitySchemas = 'ViewDataHubEntitySchemas',
  /** Grants permissions on ViewDataHubQuarantine operations */
  ViewDataHubQuarantine = 'ViewDataHubQuarantine',
  /** Grants permissions on ViewDataHubRuns operations */
  ViewDataHubRuns = 'ViewDataHubRuns',
  /** Grants permission to write DashboardGlobalViews */
  WriteDashboardGlobalViews = 'WriteDashboardGlobalViews'
}

export type PermissionDefinition = {
  __typename?: 'PermissionDefinition';
  assignable: Scalars['Boolean']['output'];
  description: Scalars['String']['output'];
  name: Scalars['String']['output'];
};

export type PreviewCollectionVariantsInput = {
  filters: Array<ConfigurableOperationInput>;
  inheritFilters: Scalars['Boolean']['input'];
  parentId?: InputMaybe<Scalars['ID']['input']>;
};

/** The price range where the result has more than one price */
export type PriceRange = {
  __typename?: 'PriceRange';
  max: Scalars['Money']['output'];
  min: Scalars['Money']['output'];
};

export type Product = Node & {
  __typename?: 'Product';
  assets: Array<Asset>;
  channels: Array<Channel>;
  collections: Array<Collection>;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  description: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  facetValues: Array<FacetValue>;
  featuredAsset?: Maybe<Asset>;
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  optionGroups: Array<ProductOptionGroup>;
  slug: Scalars['String']['output'];
  translations: Array<ProductTranslation>;
  updatedAt: Scalars['DateTime']['output'];
  /** Returns a paginated, sortable, filterable list of ProductVariants */
  variantList: ProductVariantList;
  /** Returns all ProductVariants */
  variants: Array<ProductVariant>;
};


export type ProductVariantListArgs = {
  options?: InputMaybe<ProductVariantListOptions>;
};

export type ProductFilterParameter = {
  _and?: InputMaybe<Array<ProductFilterParameter>>;
  _or?: InputMaybe<Array<ProductFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  description?: InputMaybe<StringOperators>;
  enabled?: InputMaybe<BooleanOperators>;
  facetValueId?: InputMaybe<IdOperators>;
  id?: InputMaybe<IdOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  sku?: InputMaybe<StringOperators>;
  slug?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type ProductList = PaginatedList & {
  __typename?: 'ProductList';
  items: Array<Product>;
  totalItems: Scalars['Int']['output'];
};

export type ProductListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<ProductFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<ProductSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type ProductOption = Node & {
  __typename?: 'ProductOption';
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  group: ProductOptionGroup;
  groupId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  translations: Array<ProductOptionTranslation>;
  updatedAt: Scalars['DateTime']['output'];
};

export type ProductOptionFilterParameter = {
  _and?: InputMaybe<Array<ProductOptionFilterParameter>>;
  _or?: InputMaybe<Array<ProductOptionFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  groupId?: InputMaybe<IdOperators>;
  id?: InputMaybe<IdOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type ProductOptionGroup = Node & {
  __typename?: 'ProductOptionGroup';
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  options: Array<ProductOption>;
  translations: Array<ProductOptionGroupTranslation>;
  updatedAt: Scalars['DateTime']['output'];
};

export type ProductOptionGroupTranslation = {
  __typename?: 'ProductOptionGroupTranslation';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ProductOptionGroupTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type ProductOptionInUseError = ErrorResult & {
  __typename?: 'ProductOptionInUseError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
  optionGroupCode: Scalars['String']['output'];
  productVariantCount: Scalars['Int']['output'];
};

export type ProductOptionList = PaginatedList & {
  __typename?: 'ProductOptionList';
  items: Array<ProductOption>;
  totalItems: Scalars['Int']['output'];
};

export type ProductOptionListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<ProductOptionFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<ProductOptionSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type ProductOptionSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  groupId?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type ProductOptionTranslation = {
  __typename?: 'ProductOptionTranslation';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ProductOptionTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type ProductSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  slug?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type ProductTranslation = {
  __typename?: 'ProductTranslation';
  createdAt: Scalars['DateTime']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ProductTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
};

export type ProductVariant = Node & {
  __typename?: 'ProductVariant';
  assets: Array<Asset>;
  channels: Array<Channel>;
  createdAt: Scalars['DateTime']['output'];
  currencyCode: CurrencyCode;
  customFields?: Maybe<Scalars['JSON']['output']>;
  enabled: Scalars['Boolean']['output'];
  facetValues: Array<FacetValue>;
  featuredAsset?: Maybe<Asset>;
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  options: Array<ProductOption>;
  outOfStockThreshold: Scalars['Int']['output'];
  price: Scalars['Money']['output'];
  priceWithTax: Scalars['Money']['output'];
  prices: Array<ProductVariantPrice>;
  product: Product;
  productId: Scalars['ID']['output'];
  sku: Scalars['String']['output'];
  /** @deprecated use stockLevels */
  stockAllocated: Scalars['Int']['output'];
  stockLevel: Scalars['String']['output'];
  stockLevels: Array<StockLevel>;
  stockMovements: StockMovementList;
  /** @deprecated use stockLevels */
  stockOnHand: Scalars['Int']['output'];
  taxCategory: TaxCategory;
  taxRateApplied: TaxRate;
  trackInventory: GlobalFlag;
  translations: Array<ProductVariantTranslation>;
  updatedAt: Scalars['DateTime']['output'];
  useGlobalOutOfStockThreshold: Scalars['Boolean']['output'];
};


export type ProductVariantStockMovementsArgs = {
  options?: InputMaybe<StockMovementListOptions>;
};

export type ProductVariantFilterParameter = {
  _and?: InputMaybe<Array<ProductVariantFilterParameter>>;
  _or?: InputMaybe<Array<ProductVariantFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  currencyCode?: InputMaybe<StringOperators>;
  enabled?: InputMaybe<BooleanOperators>;
  facetValueId?: InputMaybe<IdOperators>;
  id?: InputMaybe<IdOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  outOfStockThreshold?: InputMaybe<NumberOperators>;
  price?: InputMaybe<NumberOperators>;
  priceWithTax?: InputMaybe<NumberOperators>;
  productId?: InputMaybe<IdOperators>;
  sku?: InputMaybe<StringOperators>;
  stockAllocated?: InputMaybe<NumberOperators>;
  stockLevel?: InputMaybe<StringOperators>;
  stockOnHand?: InputMaybe<NumberOperators>;
  trackInventory?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
  useGlobalOutOfStockThreshold?: InputMaybe<BooleanOperators>;
};

export type ProductVariantList = PaginatedList & {
  __typename?: 'ProductVariantList';
  items: Array<ProductVariant>;
  totalItems: Scalars['Int']['output'];
};

export type ProductVariantListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<ProductVariantFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<ProductVariantSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type ProductVariantPrice = {
  __typename?: 'ProductVariantPrice';
  currencyCode: CurrencyCode;
  customFields?: Maybe<Scalars['JSON']['output']>;
  price: Scalars['Money']['output'];
};

export type ProductVariantSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  outOfStockThreshold?: InputMaybe<SortOrder>;
  price?: InputMaybe<SortOrder>;
  priceWithTax?: InputMaybe<SortOrder>;
  productId?: InputMaybe<SortOrder>;
  sku?: InputMaybe<SortOrder>;
  stockAllocated?: InputMaybe<SortOrder>;
  stockLevel?: InputMaybe<SortOrder>;
  stockOnHand?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type ProductVariantTranslation = {
  __typename?: 'ProductVariantTranslation';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ProductVariantTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type Promotion = Node & {
  __typename?: 'Promotion';
  actions: Array<ConfigurableOperation>;
  conditions: Array<ConfigurableOperation>;
  couponCode?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  description: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  endsAt?: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  perCustomerUsageLimit?: Maybe<Scalars['Int']['output']>;
  startsAt?: Maybe<Scalars['DateTime']['output']>;
  translations: Array<PromotionTranslation>;
  updatedAt: Scalars['DateTime']['output'];
  usageLimit?: Maybe<Scalars['Int']['output']>;
};

export type PromotionFilterParameter = {
  _and?: InputMaybe<Array<PromotionFilterParameter>>;
  _or?: InputMaybe<Array<PromotionFilterParameter>>;
  couponCode?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  description?: InputMaybe<StringOperators>;
  enabled?: InputMaybe<BooleanOperators>;
  endsAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  name?: InputMaybe<StringOperators>;
  perCustomerUsageLimit?: InputMaybe<NumberOperators>;
  startsAt?: InputMaybe<DateOperators>;
  updatedAt?: InputMaybe<DateOperators>;
  usageLimit?: InputMaybe<NumberOperators>;
};

export type PromotionList = PaginatedList & {
  __typename?: 'PromotionList';
  items: Array<Promotion>;
  totalItems: Scalars['Int']['output'];
};

export type PromotionListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<PromotionFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<PromotionSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type PromotionSortParameter = {
  couponCode?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  endsAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  perCustomerUsageLimit?: InputMaybe<SortOrder>;
  startsAt?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
  usageLimit?: InputMaybe<SortOrder>;
};

export type PromotionTranslation = {
  __typename?: 'PromotionTranslation';
  createdAt: Scalars['DateTime']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type PromotionTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type Province = Node & Region & {
  __typename?: 'Province';
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  enabled: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  parent?: Maybe<Region>;
  parentId?: Maybe<Scalars['ID']['output']>;
  translations: Array<RegionTranslation>;
  type: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ProvinceFilterParameter = {
  _and?: InputMaybe<Array<ProvinceFilterParameter>>;
  _or?: InputMaybe<Array<ProvinceFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  enabled?: InputMaybe<BooleanOperators>;
  id?: InputMaybe<IdOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  parentId?: InputMaybe<IdOperators>;
  type?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type ProvinceList = PaginatedList & {
  __typename?: 'ProvinceList';
  items: Array<Province>;
  totalItems: Scalars['Int']['output'];
};

export type ProvinceListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<ProvinceFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<ProvinceSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type ProvinceSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  parentId?: InputMaybe<SortOrder>;
  type?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type ProvinceTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

/** Returned if the specified quantity of an OrderLine is greater than the number of items in that line */
export type QuantityTooGreatError = ErrorResult & {
  __typename?: 'QuantityTooGreatError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

export type Query = {
  __typename?: 'Query';
  activeAdministrator?: Maybe<Administrator>;
  activeChannel: Channel;
  administrator?: Maybe<Administrator>;
  administrators: AdministratorList;
  /** Get a single Asset by id */
  asset?: Maybe<Asset>;
  /** Get a list of Assets */
  assets: AssetList;
  channel?: Maybe<Channel>;
  channels: ChannelList;
  /** Get a Collection either by id or slug. If neither id nor slug is specified, an error will result. */
  collection?: Maybe<Collection>;
  collectionFilters: Array<ConfigurableOperationDefinition>;
  collections: CollectionList;
  countries: CountryList;
  country?: Maybe<Country>;
  customer?: Maybe<Customer>;
  customerGroup?: Maybe<CustomerGroup>;
  customerGroups: CustomerGroupList;
  customers: CustomerList;
  /** Get metrics for the given date range and metric types. */
  dashboardMetricSummary: Array<DashboardMetricSummary>;
  dataHubAdapters: Array<DataHubAdapter>;
  dataHubAnalyticsOverview: DataHubAnalyticsOverview;
  /** Get the current AutoMapper configuration (global or per-pipeline) */
  dataHubAutoMapperConfig: DataHubAutoMapperConfig;
  /** Get the default AutoMapper configuration */
  dataHubAutoMapperDefaultConfig: DataHubAutoMapperConfig;
  dataHubCheckpoint?: Maybe<DataHubCheckpoint>;
  /** Compare sandbox results between two pipeline revisions */
  dataHubCompareSandboxResults: DataHubSandboxComparison;
  /** Returns all enum/option values used by the frontend for dropdowns and selections. */
  dataHubConfigOptions: DataHubConfigOptions;
  dataHubConnection?: Maybe<DataHubConnection>;
  dataHubConnections: DataHubConnectionList;
  dataHubConsumers: Array<DataHubConsumerStatus>;
  dataHubDeadLetterQueue: Array<DataHubWebhookDelivery>;
  dataHubDeadLetters: Array<DataHubRecordError>;
  dataHubErrorAnalytics: DataHubErrorAnalytics;
  dataHubEvents: Array<DataHubEvent>;
  dataHubExportDestination?: Maybe<DataHubExportDestination>;
  dataHubExportDestinations: Array<DataHubExportDestination>;
  /** List all export templates (built-in + custom) */
  dataHubExportTemplates: Array<DataHubExportTemplate>;
  /** Get a specific extractor by code */
  dataHubExtractor?: Maybe<DataHubExtractor>;
  /** Get the configuration schema for a specific extractor */
  dataHubExtractorSchema?: Maybe<DataHubExtractorConfigSchema>;
  /** List all registered extractors */
  dataHubExtractors: Array<DataHubExtractor>;
  /** Get extractors grouped by category for UI display */
  dataHubExtractorsByCategory: Array<DataHubExtractorsByCategory>;
  dataHubFeedFormats: Array<DataHubFeedFormatInfo>;
  dataHubFeeds: Array<DataHubFeed>;
  /** Check if pipeline has unpublished changes */
  dataHubHasUnpublishedChanges: Scalars['Boolean']['output'];
  /** Get impact analysis for a pipeline */
  dataHubImpactAnalysis: DataHubImpactAnalysis;
  /** List import template categories with metadata and counts */
  dataHubImportTemplateCategories: Array<DataHubTemplateCategory>;
  /** List all import templates (built-in + custom) */
  dataHubImportTemplates: Array<DataHubImportTemplate>;
  dataHubJob?: Maybe<DataHubJob>;
  dataHubJobByCode?: Maybe<DataHubJob>;
  dataHubJobRun?: Maybe<DataHubJobRun>;
  dataHubJobRuns: DataHubJobRunList;
  dataHubJobs: DataHubJobList;
  /** Preview load operations for a pipeline */
  dataHubLoadPreview: Array<DataHubSandboxLoadPreview>;
  /**
   * Get the field schema for a specific entity type.
   * Returns the available fields for mapping data to this entity.
   */
  dataHubLoaderEntitySchema?: Maybe<DataHubLoaderEntitySchema>;
  /**
   * Get field schemas for all registered entity types.
   * Useful for populating dropdowns and showing all available targets.
   */
  dataHubLoaderEntitySchemas: Array<DataHubLoaderEntitySchema>;
  dataHubLogStats: DataHubLogStats;
  /**
   * Query logs with standard Vendure list options (filter, sort, pagination).
   * Use the filter parameter with operators like: { pipelineId: { eq: "123" }, level: { eq: "ERROR" } }
   */
  dataHubLogs: DataHubLogList;
  dataHubPipeline?: Maybe<DataHubPipeline>;
  dataHubPipelineDependencies: Array<DataHubPipeline>;
  dataHubPipelineDependents: Array<DataHubPipeline>;
  dataHubPipelineHooks: Scalars['JSON']['output'];
  dataHubPipelinePerformance: Array<DataHubPipelinePerformance>;
  dataHubPipelineRevisions: Array<DataHubPipelineRevision>;
  dataHubPipelineRun?: Maybe<DataHubPipelineRun>;
  dataHubPipelineRuns: DataHubPipelineRunList;
  /** Get timeline of revisions for a pipeline */
  dataHubPipelineTimeline: Array<DataHubTimelineEntry>;
  dataHubPipelines: DataHubPipelineList;
  dataHubQueueStats: DataHubQueueStats;
  dataHubRealTimeStats: DataHubRealTimeStats;
  dataHubRecentLogs: Array<DataHubLog>;
  /** Get detailed record information for drill-down */
  dataHubRecordDetails: Array<DataHubRecordDetail>;
  /** Get detailed record lineage for a specific record */
  dataHubRecordLineageDetail?: Maybe<DataHubSandboxRecordLineage>;
  dataHubRecordRetryAudits: Array<DataHubRecordRetryAudit>;
  /** Get a specific revision */
  dataHubRevision?: Maybe<DataHubPipelineRevisionExtended>;
  /** Get diff between two revisions */
  dataHubRevisionDiff: DataHubRevisionDiff;
  dataHubRunErrors: Array<DataHubRecordError>;
  dataHubRunLogs: Array<DataHubLog>;
  /**
   * Execute a sandbox/dry run for a pipeline
   * Returns detailed step-by-step results with record samples and field diffs
   */
  dataHubSandbox: DataHubSandboxResult;
  /** Execute sandbox with a custom definition (for testing unpublished changes) */
  dataHubSandboxWithDefinition: DataHubSandboxResult;
  dataHubSecret?: Maybe<DataHubSecret>;
  dataHubSecrets: DataHubSecretList;
  dataHubSettings: DataHubSettings;
  /** Analyze impact of a specific step */
  dataHubStepAnalysis: DataHubStepAnalysis;
  dataHubStorageStats: DataHubStorageStats;
  /**
   * List all supported entity types with their operations.
   * Use this to show available entity types in the UI.
   */
  dataHubSupportedEntities: Array<DataHubSupportedEntity>;
  dataHubThroughputMetrics: DataHubThroughputMetrics;
  /** Convert visual (nodes/edges) definition to canonical (step-based) format */
  dataHubToCanonicalFormat: DataHubFormatConversionResult;
  /** Convert canonical (step-based) definition to visual (nodes/edges) format */
  dataHubToVisualFormat: DataHubFormatConversionResult;
  dataHubVendureSchema?: Maybe<DataHubVendureEntitySchema>;
  dataHubVendureSchemas: Array<DataHubVendureEntitySchema>;
  dataHubWebhookDeliveries: Array<DataHubWebhookDelivery>;
  dataHubWebhookDelivery?: Maybe<DataHubWebhookDelivery>;
  dataHubWebhookStats: DataHubWebhookStats;
  /** Returns a list of eligible shipping methods for the draft Order */
  eligibleShippingMethodsForDraftOrder: Array<ShippingMethodQuote>;
  /** Returns all configured EntityDuplicators. */
  entityDuplicators: Array<EntityDuplicatorDefinition>;
  facet?: Maybe<Facet>;
  facetValue?: Maybe<FacetValue>;
  facetValues: FacetValueList;
  facets: FacetList;
  fulfillmentHandlers: Array<ConfigurableOperationDefinition>;
  /** Get value for a specific key (automatically scoped based on field configuration) */
  getSettingsStoreValue?: Maybe<Scalars['JSON']['output']>;
  /** Get multiple key-value pairs (each automatically scoped) */
  getSettingsStoreValues?: Maybe<Scalars['JSON']['output']>;
  globalSettings: GlobalSettings;
  job?: Maybe<Job>;
  jobBufferSize: Array<JobBufferSize>;
  jobQueues: Array<JobQueue>;
  jobs: JobList;
  jobsById: Array<Job>;
  me?: Maybe<CurrentUser>;
  order?: Maybe<Order>;
  orders: OrderList;
  paymentMethod?: Maybe<PaymentMethod>;
  paymentMethodEligibilityCheckers: Array<ConfigurableOperationDefinition>;
  paymentMethodHandlers: Array<ConfigurableOperationDefinition>;
  paymentMethods: PaymentMethodList;
  pendingSearchIndexUpdates: Scalars['Int']['output'];
  /** Used for real-time previews of the contents of a Collection */
  previewCollectionVariants: ProductVariantList;
  /** Get a Product either by id or slug. If neither id nor slug is specified, an error will result. */
  product?: Maybe<Product>;
  productOption?: Maybe<ProductOption>;
  productOptionGroup?: Maybe<ProductOptionGroup>;
  productOptionGroups: Array<ProductOptionGroup>;
  productOptions: ProductOptionList;
  /** Get a ProductVariant by id */
  productVariant?: Maybe<ProductVariant>;
  /** List ProductVariants either all or for the specific product. */
  productVariants: ProductVariantList;
  /** List Products */
  products: ProductList;
  promotion?: Maybe<Promotion>;
  promotionActions: Array<ConfigurableOperationDefinition>;
  promotionConditions: Array<ConfigurableOperationDefinition>;
  promotions: PromotionList;
  province?: Maybe<Province>;
  provinces: ProvinceList;
  role?: Maybe<Role>;
  roles: RoleList;
  scheduledTasks: Array<ScheduledTask>;
  search: SearchResponse;
  seller?: Maybe<Seller>;
  sellers: SellerList;
  shippingCalculators: Array<ConfigurableOperationDefinition>;
  shippingEligibilityCheckers: Array<ConfigurableOperationDefinition>;
  shippingMethod?: Maybe<ShippingMethod>;
  shippingMethods: ShippingMethodList;
  /** Generate slug for entity */
  slugForEntity: Scalars['String']['output'];
  stockLocation?: Maybe<StockLocation>;
  stockLocations: StockLocationList;
  tag: Tag;
  tags: TagList;
  taxCategories: TaxCategoryList;
  taxCategory?: Maybe<TaxCategory>;
  taxRate?: Maybe<TaxRate>;
  taxRates: TaxRateList;
  testEligibleShippingMethods: Array<ShippingMethodQuote>;
  testShippingMethod: TestShippingMethodResult;
  /** Validate AutoMapper configuration without saving */
  validateDataHubAutoMapperConfig: DataHubAutoMapperConfigValidation;
  validateDataHubPipelineDefinition: DataHubValidationResult;
  zone?: Maybe<Zone>;
  zones: ZoneList;
};


export type QueryAdministratorArgs = {
  id: Scalars['ID']['input'];
};


export type QueryAdministratorsArgs = {
  options?: InputMaybe<AdministratorListOptions>;
};


export type QueryAssetArgs = {
  id: Scalars['ID']['input'];
};


export type QueryAssetsArgs = {
  options?: InputMaybe<AssetListOptions>;
};


export type QueryChannelArgs = {
  id: Scalars['ID']['input'];
};


export type QueryChannelsArgs = {
  options?: InputMaybe<ChannelListOptions>;
};


export type QueryCollectionArgs = {
  id?: InputMaybe<Scalars['ID']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
};


export type QueryCollectionsArgs = {
  options?: InputMaybe<CollectionListOptions>;
};


export type QueryCountriesArgs = {
  options?: InputMaybe<CountryListOptions>;
};


export type QueryCountryArgs = {
  id: Scalars['ID']['input'];
};


export type QueryCustomerArgs = {
  id: Scalars['ID']['input'];
};


export type QueryCustomerGroupArgs = {
  id: Scalars['ID']['input'];
};


export type QueryCustomerGroupsArgs = {
  options?: InputMaybe<CustomerGroupListOptions>;
};


export type QueryCustomersArgs = {
  options?: InputMaybe<CustomerListOptions>;
};


export type QueryDashboardMetricSummaryArgs = {
  input?: InputMaybe<DashboardMetricSummaryInput>;
};


export type QueryDataHubAutoMapperConfigArgs = {
  pipelineId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryDataHubCheckpointArgs = {
  pipelineId: Scalars['ID']['input'];
};


export type QueryDataHubCompareSandboxResultsArgs = {
  fromRevisionId: Scalars['ID']['input'];
  options?: InputMaybe<DataHubSandboxOptions>;
  pipelineId: Scalars['ID']['input'];
  toRevisionId: Scalars['ID']['input'];
};


export type QueryDataHubConnectionArgs = {
  id: Scalars['ID']['input'];
};


export type QueryDataHubConnectionsArgs = {
  options?: InputMaybe<DataHubConnectionListOptions>;
};


export type QueryDataHubErrorAnalyticsArgs = {
  fromDate?: InputMaybe<Scalars['DateTime']['input']>;
  pipelineCode?: InputMaybe<Scalars['String']['input']>;
  toDate?: InputMaybe<Scalars['DateTime']['input']>;
};


export type QueryDataHubEventsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryDataHubExportDestinationArgs = {
  id: Scalars['String']['input'];
};


export type QueryDataHubExtractorArgs = {
  code: Scalars['String']['input'];
};


export type QueryDataHubExtractorSchemaArgs = {
  code: Scalars['String']['input'];
};


export type QueryDataHubHasUnpublishedChangesArgs = {
  pipelineId: Scalars['ID']['input'];
};


export type QueryDataHubImpactAnalysisArgs = {
  options?: InputMaybe<DataHubImpactAnalysisOptions>;
  pipelineId: Scalars['ID']['input'];
};


export type QueryDataHubJobArgs = {
  id: Scalars['ID']['input'];
};


export type QueryDataHubJobByCodeArgs = {
  code: Scalars['String']['input'];
};


export type QueryDataHubJobRunArgs = {
  id: Scalars['ID']['input'];
};


export type QueryDataHubJobRunsArgs = {
  jobId?: InputMaybe<Scalars['ID']['input']>;
  options?: InputMaybe<DataHubJobRunListOptions>;
};


export type QueryDataHubJobsArgs = {
  options?: InputMaybe<DataHubJobListOptions>;
};


export type QueryDataHubLoadPreviewArgs = {
  options?: InputMaybe<DataHubSandboxOptions>;
  pipelineId: Scalars['ID']['input'];
};


export type QueryDataHubLoaderEntitySchemaArgs = {
  entityType: Scalars['String']['input'];
};


export type QueryDataHubLogStatsArgs = {
  pipelineId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryDataHubLogsArgs = {
  options?: InputMaybe<DataHubLogListOptions>;
};


export type QueryDataHubPipelineArgs = {
  id: Scalars['ID']['input'];
};


export type QueryDataHubPipelineDependenciesArgs = {
  id: Scalars['ID']['input'];
};


export type QueryDataHubPipelineDependentsArgs = {
  id: Scalars['ID']['input'];
};


export type QueryDataHubPipelineHooksArgs = {
  pipelineId: Scalars['ID']['input'];
};


export type QueryDataHubPipelinePerformanceArgs = {
  fromDate?: InputMaybe<Scalars['DateTime']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  pipelineCode?: InputMaybe<Scalars['String']['input']>;
  toDate?: InputMaybe<Scalars['DateTime']['input']>;
};


export type QueryDataHubPipelineRevisionsArgs = {
  pipelineId: Scalars['ID']['input'];
};


export type QueryDataHubPipelineRunArgs = {
  id: Scalars['ID']['input'];
};


export type QueryDataHubPipelineRunsArgs = {
  options?: InputMaybe<DataHubPipelineRunListOptions>;
  pipelineId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryDataHubPipelineTimelineArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  pipelineId: Scalars['ID']['input'];
};


export type QueryDataHubPipelinesArgs = {
  options?: InputMaybe<DataHubPipelineListOptions>;
};


export type QueryDataHubRecentLogsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryDataHubRecordDetailsArgs = {
  pipelineId: Scalars['ID']['input'];
  recordIds: Array<Scalars['String']['input']>;
};


export type QueryDataHubRecordLineageDetailArgs = {
  options?: InputMaybe<DataHubSandboxOptions>;
  pipelineId: Scalars['ID']['input'];
  recordIndex: Scalars['Int']['input'];
};


export type QueryDataHubRecordRetryAuditsArgs = {
  errorId: Scalars['ID']['input'];
};


export type QueryDataHubRevisionArgs = {
  revisionId: Scalars['ID']['input'];
};


export type QueryDataHubRevisionDiffArgs = {
  fromRevisionId: Scalars['ID']['input'];
  toRevisionId: Scalars['ID']['input'];
};


export type QueryDataHubRunErrorsArgs = {
  runId: Scalars['ID']['input'];
};


export type QueryDataHubRunLogsArgs = {
  runId: Scalars['ID']['input'];
};


export type QueryDataHubSandboxArgs = {
  options?: InputMaybe<DataHubSandboxOptions>;
  pipelineId: Scalars['ID']['input'];
};


export type QueryDataHubSandboxWithDefinitionArgs = {
  input: DataHubSandboxWithDefinitionInput;
};


export type QueryDataHubSecretArgs = {
  id: Scalars['ID']['input'];
};


export type QueryDataHubSecretsArgs = {
  options?: InputMaybe<DataHubSecretListOptions>;
};


export type QueryDataHubStepAnalysisArgs = {
  options?: InputMaybe<DataHubImpactAnalysisOptions>;
  pipelineId: Scalars['ID']['input'];
  stepKey: Scalars['String']['input'];
};


export type QueryDataHubThroughputMetricsArgs = {
  intervalMinutes?: InputMaybe<Scalars['Int']['input']>;
  periods?: InputMaybe<Scalars['Int']['input']>;
  pipelineCode?: InputMaybe<Scalars['String']['input']>;
};


export type QueryDataHubToCanonicalFormatArgs = {
  definition: Scalars['JSON']['input'];
};


export type QueryDataHubToVisualFormatArgs = {
  definition: Scalars['JSON']['input'];
};


export type QueryDataHubVendureSchemaArgs = {
  entity: Scalars['String']['input'];
};


export type QueryDataHubWebhookDeliveriesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<DataHubWebhookDeliveryStatus>;
  webhookId?: InputMaybe<Scalars['String']['input']>;
};


export type QueryDataHubWebhookDeliveryArgs = {
  deliveryId: Scalars['String']['input'];
};


export type QueryEligibleShippingMethodsForDraftOrderArgs = {
  orderId: Scalars['ID']['input'];
};


export type QueryFacetArgs = {
  id: Scalars['ID']['input'];
};


export type QueryFacetValueArgs = {
  id: Scalars['ID']['input'];
};


export type QueryFacetValuesArgs = {
  options?: InputMaybe<FacetValueListOptions>;
};


export type QueryFacetsArgs = {
  options?: InputMaybe<FacetListOptions>;
};


export type QueryGetSettingsStoreValueArgs = {
  key: Scalars['String']['input'];
};


export type QueryGetSettingsStoreValuesArgs = {
  keys: Array<Scalars['String']['input']>;
};


export type QueryJobArgs = {
  jobId: Scalars['ID']['input'];
};


export type QueryJobBufferSizeArgs = {
  bufferIds?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type QueryJobsArgs = {
  options?: InputMaybe<JobListOptions>;
};


export type QueryJobsByIdArgs = {
  jobIds: Array<Scalars['ID']['input']>;
};


export type QueryOrderArgs = {
  id: Scalars['ID']['input'];
};


export type QueryOrdersArgs = {
  options?: InputMaybe<OrderListOptions>;
};


export type QueryPaymentMethodArgs = {
  id: Scalars['ID']['input'];
};


export type QueryPaymentMethodsArgs = {
  options?: InputMaybe<PaymentMethodListOptions>;
};


export type QueryPreviewCollectionVariantsArgs = {
  input: PreviewCollectionVariantsInput;
  options?: InputMaybe<ProductVariantListOptions>;
};


export type QueryProductArgs = {
  id?: InputMaybe<Scalars['ID']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
};


export type QueryProductOptionArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProductOptionGroupArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProductOptionGroupsArgs = {
  filterTerm?: InputMaybe<Scalars['String']['input']>;
};


export type QueryProductOptionsArgs = {
  groupId?: InputMaybe<Scalars['ID']['input']>;
  options?: InputMaybe<ProductOptionListOptions>;
};


export type QueryProductVariantArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProductVariantsArgs = {
  options?: InputMaybe<ProductVariantListOptions>;
  productId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryProductsArgs = {
  options?: InputMaybe<ProductListOptions>;
};


export type QueryPromotionArgs = {
  id: Scalars['ID']['input'];
};


export type QueryPromotionsArgs = {
  options?: InputMaybe<PromotionListOptions>;
};


export type QueryProvinceArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProvincesArgs = {
  options?: InputMaybe<ProvinceListOptions>;
};


export type QueryRoleArgs = {
  id: Scalars['ID']['input'];
};


export type QueryRolesArgs = {
  options?: InputMaybe<RoleListOptions>;
};


export type QuerySearchArgs = {
  input: SearchInput;
};


export type QuerySellerArgs = {
  id: Scalars['ID']['input'];
};


export type QuerySellersArgs = {
  options?: InputMaybe<SellerListOptions>;
};


export type QueryShippingMethodArgs = {
  id: Scalars['ID']['input'];
};


export type QueryShippingMethodsArgs = {
  options?: InputMaybe<ShippingMethodListOptions>;
};


export type QuerySlugForEntityArgs = {
  input: SlugForEntityInput;
};


export type QueryStockLocationArgs = {
  id: Scalars['ID']['input'];
};


export type QueryStockLocationsArgs = {
  options?: InputMaybe<StockLocationListOptions>;
};


export type QueryTagArgs = {
  id: Scalars['ID']['input'];
};


export type QueryTagsArgs = {
  options?: InputMaybe<TagListOptions>;
};


export type QueryTaxCategoriesArgs = {
  options?: InputMaybe<TaxCategoryListOptions>;
};


export type QueryTaxCategoryArgs = {
  id: Scalars['ID']['input'];
};


export type QueryTaxRateArgs = {
  id: Scalars['ID']['input'];
};


export type QueryTaxRatesArgs = {
  options?: InputMaybe<TaxRateListOptions>;
};


export type QueryTestEligibleShippingMethodsArgs = {
  input: TestEligibleShippingMethodsInput;
};


export type QueryTestShippingMethodArgs = {
  input: TestShippingMethodInput;
};


export type QueryValidateDataHubAutoMapperConfigArgs = {
  input: DataHubAutoMapperConfigInput;
};


export type QueryValidateDataHubPipelineDefinitionArgs = {
  definition: Scalars['JSON']['input'];
  level?: InputMaybe<Scalars['String']['input']>;
};


export type QueryZoneArgs = {
  id: Scalars['ID']['input'];
};


export type QueryZonesArgs = {
  options?: InputMaybe<ZoneListOptions>;
};

export type Refund = Node & {
  __typename?: 'Refund';
  adjustment: Scalars['Money']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  items: Scalars['Money']['output'];
  lines: Array<RefundLine>;
  metadata?: Maybe<Scalars['JSON']['output']>;
  method?: Maybe<Scalars['String']['output']>;
  paymentId: Scalars['ID']['output'];
  reason?: Maybe<Scalars['String']['output']>;
  shipping: Scalars['Money']['output'];
  state: Scalars['String']['output'];
  total: Scalars['Money']['output'];
  transactionId?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

/** Returned if `amount` is greater than the maximum un-refunded amount of the Payment */
export type RefundAmountError = ErrorResult & {
  __typename?: 'RefundAmountError';
  errorCode: ErrorCode;
  maximumRefundable: Scalars['Int']['output'];
  message: Scalars['String']['output'];
};

export type RefundLine = {
  __typename?: 'RefundLine';
  orderLine: OrderLine;
  orderLineId: Scalars['ID']['output'];
  quantity: Scalars['Int']['output'];
  refund: Refund;
  refundId: Scalars['ID']['output'];
};

export type RefundOrderInput = {
  /**
   * The amount to be refunded to this particular payment. This was introduced in v2.2.0 as the preferred way to specify the refund amount.
   * Can be as much as the total amount of the payment minus the sum of all previous refunds.
   */
  amount?: InputMaybe<Scalars['Money']['input']>;
  paymentId: Scalars['ID']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
};

export type RefundOrderResult = AlreadyRefundedError | MultipleOrderError | NothingToRefundError | OrderStateTransitionError | PaymentOrderMismatchError | QuantityTooGreatError | Refund | RefundAmountError | RefundOrderStateError | RefundStateTransitionError;

/** Returned if an attempting to refund an Order which is not in the expected state */
export type RefundOrderStateError = ErrorResult & {
  __typename?: 'RefundOrderStateError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
  orderState: Scalars['String']['output'];
};

/**
 * Returned when a call to modifyOrder fails to include a refundPaymentId even
 * though the price has decreased as a result of the changes.
 */
export type RefundPaymentIdMissingError = ErrorResult & {
  __typename?: 'RefundPaymentIdMissingError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
};

/** Returned when there is an error in transitioning the Refund state */
export type RefundStateTransitionError = ErrorResult & {
  __typename?: 'RefundStateTransitionError';
  errorCode: ErrorCode;
  fromState: Scalars['String']['output'];
  message: Scalars['String']['output'];
  toState: Scalars['String']['output'];
  transitionError: Scalars['String']['output'];
};

export type Region = {
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  enabled: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  parent?: Maybe<Region>;
  parentId?: Maybe<Scalars['ID']['output']>;
  translations: Array<RegionTranslation>;
  type: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type RegionTranslation = {
  __typename?: 'RegionTranslation';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type RelationCustomFieldConfig = CustomField & {
  __typename?: 'RelationCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  entity: Scalars['String']['output'];
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  scalarFields: Array<Scalars['String']['output']>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type Release = Node & StockMovement & {
  __typename?: 'Release';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  productVariant: ProductVariant;
  quantity: Scalars['Int']['output'];
  type: StockMovementType;
  updatedAt: Scalars['DateTime']['output'];
};

export type RemoveCollectionsFromChannelInput = {
  channelId: Scalars['ID']['input'];
  collectionIds: Array<Scalars['ID']['input']>;
};

export type RemoveFacetFromChannelResult = Facet | FacetInUseError;

export type RemoveFacetsFromChannelInput = {
  channelId: Scalars['ID']['input'];
  facetIds: Array<Scalars['ID']['input']>;
  force?: InputMaybe<Scalars['Boolean']['input']>;
};

export type RemoveOptionGroupFromProductResult = Product | ProductOptionInUseError;

export type RemoveOrderItemsResult = Order | OrderInterceptorError | OrderModificationError;

export type RemovePaymentMethodsFromChannelInput = {
  channelId: Scalars['ID']['input'];
  paymentMethodIds: Array<Scalars['ID']['input']>;
};

export type RemoveProductVariantsFromChannelInput = {
  channelId: Scalars['ID']['input'];
  productVariantIds: Array<Scalars['ID']['input']>;
};

export type RemoveProductsFromChannelInput = {
  channelId: Scalars['ID']['input'];
  productIds: Array<Scalars['ID']['input']>;
};

export type RemovePromotionsFromChannelInput = {
  channelId: Scalars['ID']['input'];
  promotionIds: Array<Scalars['ID']['input']>;
};

export type RemoveShippingMethodsFromChannelInput = {
  channelId: Scalars['ID']['input'];
  shippingMethodIds: Array<Scalars['ID']['input']>;
};

export type RemoveStockLocationsFromChannelInput = {
  channelId: Scalars['ID']['input'];
  stockLocationIds: Array<Scalars['ID']['input']>;
};

export type Return = Node & StockMovement & {
  __typename?: 'Return';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  productVariant: ProductVariant;
  quantity: Scalars['Int']['output'];
  type: StockMovementType;
  updatedAt: Scalars['DateTime']['output'];
};

export type Role = Node & {
  __typename?: 'Role';
  channels: Array<Channel>;
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  permissions: Array<Permission>;
  updatedAt: Scalars['DateTime']['output'];
};

export type RoleFilterParameter = {
  _and?: InputMaybe<Array<RoleFilterParameter>>;
  _or?: InputMaybe<Array<RoleFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  description?: InputMaybe<StringOperators>;
  id?: InputMaybe<IdOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type RoleList = PaginatedList & {
  __typename?: 'RoleList';
  items: Array<Role>;
  totalItems: Scalars['Int']['output'];
};

export type RoleListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<RoleFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<RoleSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type RoleSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type Sale = Node & StockMovement & {
  __typename?: 'Sale';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  productVariant: ProductVariant;
  quantity: Scalars['Int']['output'];
  type: StockMovementType;
  updatedAt: Scalars['DateTime']['output'];
};

export type ScheduledTask = {
  __typename?: 'ScheduledTask';
  description: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  id: Scalars['String']['output'];
  isRunning: Scalars['Boolean']['output'];
  lastExecutedAt?: Maybe<Scalars['DateTime']['output']>;
  lastResult?: Maybe<Scalars['JSON']['output']>;
  nextExecutionAt?: Maybe<Scalars['DateTime']['output']>;
  schedule: Scalars['String']['output'];
  scheduleDescription: Scalars['String']['output'];
};

export type SearchInput = {
  collectionId?: InputMaybe<Scalars['ID']['input']>;
  collectionSlug?: InputMaybe<Scalars['String']['input']>;
  facetValueFilters?: InputMaybe<Array<FacetValueFilterInput>>;
  groupByProduct?: InputMaybe<Scalars['Boolean']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<SearchResultSortParameter>;
  take?: InputMaybe<Scalars['Int']['input']>;
  term?: InputMaybe<Scalars['String']['input']>;
};

export type SearchReindexResponse = {
  __typename?: 'SearchReindexResponse';
  success: Scalars['Boolean']['output'];
};

export type SearchResponse = {
  __typename?: 'SearchResponse';
  collections: Array<CollectionResult>;
  facetValues: Array<FacetValueResult>;
  items: Array<SearchResult>;
  totalItems: Scalars['Int']['output'];
};

export type SearchResult = {
  __typename?: 'SearchResult';
  /** An array of ids of the Channels in which this result appears */
  channelIds: Array<Scalars['ID']['output']>;
  /** An array of ids of the Collections in which this result appears */
  collectionIds: Array<Scalars['ID']['output']>;
  currencyCode: CurrencyCode;
  description: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  facetIds: Array<Scalars['ID']['output']>;
  facetValueIds: Array<Scalars['ID']['output']>;
  price: SearchResultPrice;
  priceWithTax: SearchResultPrice;
  productAsset?: Maybe<SearchResultAsset>;
  productId: Scalars['ID']['output'];
  productName: Scalars['String']['output'];
  productVariantAsset?: Maybe<SearchResultAsset>;
  productVariantId: Scalars['ID']['output'];
  productVariantName: Scalars['String']['output'];
  /** A relevance score for the result. Differs between database implementations */
  score: Scalars['Float']['output'];
  sku: Scalars['String']['output'];
  slug: Scalars['String']['output'];
};

export type SearchResultAsset = {
  __typename?: 'SearchResultAsset';
  focalPoint?: Maybe<Coordinate>;
  id: Scalars['ID']['output'];
  preview: Scalars['String']['output'];
};

/** The price of a search result product, either as a range or as a single price */
export type SearchResultPrice = PriceRange | SinglePrice;

export type SearchResultSortParameter = {
  name?: InputMaybe<SortOrder>;
  price?: InputMaybe<SortOrder>;
};

export type Seller = Node & {
  __typename?: 'Seller';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type SellerFilterParameter = {
  _and?: InputMaybe<Array<SellerFilterParameter>>;
  _or?: InputMaybe<Array<SellerFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type SellerList = PaginatedList & {
  __typename?: 'SellerList';
  items: Array<Seller>;
  totalItems: Scalars['Int']['output'];
};

export type SellerListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<SellerFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<SellerSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type SellerSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type ServerConfig = {
  __typename?: 'ServerConfig';
  /**
   * This field is deprecated in v2.2 in favor of the entityCustomFields field,
   * which allows custom fields to be defined on user-supplies entities.
   */
  customFieldConfig: CustomFields;
  entityCustomFields: Array<EntityCustomFields>;
  moneyStrategyPrecision: Scalars['Int']['output'];
  orderProcess: Array<OrderProcessState>;
  permissions: Array<PermissionDefinition>;
  permittedAssetTypes: Array<Scalars['String']['output']>;
};

export type SetCustomerForDraftOrderResult = EmailAddressConflictError | Order;

export type SetOrderCustomerInput = {
  customerId: Scalars['ID']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
  orderId: Scalars['ID']['input'];
};

export type SetOrderShippingMethodResult = IneligibleShippingMethodError | NoActiveOrderError | Order | OrderModificationError;

export type SetSettingsStoreValueResult = {
  __typename?: 'SetSettingsStoreValueResult';
  error?: Maybe<Scalars['String']['output']>;
  key: Scalars['String']['output'];
  result: Scalars['Boolean']['output'];
};

export type SettingsStoreInput = {
  key: Scalars['String']['input'];
  value: Scalars['JSON']['input'];
};

/** Returned if the Payment settlement fails */
export type SettlePaymentError = ErrorResult & {
  __typename?: 'SettlePaymentError';
  errorCode: ErrorCode;
  message: Scalars['String']['output'];
  paymentErrorMessage: Scalars['String']['output'];
};

export type SettlePaymentResult = OrderStateTransitionError | Payment | PaymentStateTransitionError | SettlePaymentError;

export type SettleRefundInput = {
  id: Scalars['ID']['input'];
  transactionId: Scalars['String']['input'];
};

export type SettleRefundResult = Refund | RefundStateTransitionError;

export type ShippingLine = {
  __typename?: 'ShippingLine';
  customFields?: Maybe<Scalars['JSON']['output']>;
  discountedPrice: Scalars['Money']['output'];
  discountedPriceWithTax: Scalars['Money']['output'];
  discounts: Array<Discount>;
  id: Scalars['ID']['output'];
  price: Scalars['Money']['output'];
  priceWithTax: Scalars['Money']['output'];
  shippingMethod: ShippingMethod;
};

export type ShippingMethod = Node & {
  __typename?: 'ShippingMethod';
  calculator: ConfigurableOperation;
  checker: ConfigurableOperation;
  code: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  description: Scalars['String']['output'];
  fulfillmentHandlerCode: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  translations: Array<ShippingMethodTranslation>;
  updatedAt: Scalars['DateTime']['output'];
};

export type ShippingMethodFilterParameter = {
  _and?: InputMaybe<Array<ShippingMethodFilterParameter>>;
  _or?: InputMaybe<Array<ShippingMethodFilterParameter>>;
  code?: InputMaybe<StringOperators>;
  createdAt?: InputMaybe<DateOperators>;
  description?: InputMaybe<StringOperators>;
  fulfillmentHandlerCode?: InputMaybe<StringOperators>;
  id?: InputMaybe<IdOperators>;
  languageCode?: InputMaybe<StringOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type ShippingMethodList = PaginatedList & {
  __typename?: 'ShippingMethodList';
  items: Array<ShippingMethod>;
  totalItems: Scalars['Int']['output'];
};

export type ShippingMethodListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<ShippingMethodFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<ShippingMethodSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type ShippingMethodQuote = {
  __typename?: 'ShippingMethodQuote';
  code: Scalars['String']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** Any optional metadata returned by the ShippingCalculator in the ShippingCalculationResult */
  metadata?: Maybe<Scalars['JSON']['output']>;
  name: Scalars['String']['output'];
  price: Scalars['Money']['output'];
  priceWithTax: Scalars['Money']['output'];
};

export type ShippingMethodSortParameter = {
  code?: InputMaybe<SortOrder>;
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  fulfillmentHandlerCode?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type ShippingMethodTranslation = {
  __typename?: 'ShippingMethodTranslation';
  createdAt: Scalars['DateTime']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  languageCode: LanguageCode;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ShippingMethodTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
};

/** The price value where the result has a single price */
export type SinglePrice = {
  __typename?: 'SinglePrice';
  value: Scalars['Money']['output'];
};

export type SlugForEntityInput = {
  entityId?: InputMaybe<Scalars['ID']['input']>;
  entityName: Scalars['String']['input'];
  fieldName: Scalars['String']['input'];
  inputValue: Scalars['String']['input'];
};

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC'
}

export type StockAdjustment = Node & StockMovement & {
  __typename?: 'StockAdjustment';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  productVariant: ProductVariant;
  quantity: Scalars['Int']['output'];
  type: StockMovementType;
  updatedAt: Scalars['DateTime']['output'];
};

export type StockLevel = Node & {
  __typename?: 'StockLevel';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  stockAllocated: Scalars['Int']['output'];
  stockLocation: StockLocation;
  stockLocationId: Scalars['ID']['output'];
  stockOnHand: Scalars['Int']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type StockLevelInput = {
  stockLocationId: Scalars['ID']['input'];
  stockOnHand: Scalars['Int']['input'];
};

export type StockLocation = Node & {
  __typename?: 'StockLocation';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type StockLocationFilterParameter = {
  _and?: InputMaybe<Array<StockLocationFilterParameter>>;
  _or?: InputMaybe<Array<StockLocationFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  description?: InputMaybe<StringOperators>;
  id?: InputMaybe<IdOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type StockLocationList = PaginatedList & {
  __typename?: 'StockLocationList';
  items: Array<StockLocation>;
  totalItems: Scalars['Int']['output'];
};

export type StockLocationListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<StockLocationFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<StockLocationSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type StockLocationSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  description?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type StockMovement = {
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  productVariant: ProductVariant;
  quantity: Scalars['Int']['output'];
  type: StockMovementType;
  updatedAt: Scalars['DateTime']['output'];
};

export type StockMovementItem = Allocation | Cancellation | Release | Return | Sale | StockAdjustment;

export type StockMovementList = {
  __typename?: 'StockMovementList';
  items: Array<StockMovementItem>;
  totalItems: Scalars['Int']['output'];
};

export type StockMovementListOptions = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  type?: InputMaybe<StockMovementType>;
};

export enum StockMovementType {
  ADJUSTMENT = 'ADJUSTMENT',
  ALLOCATION = 'ALLOCATION',
  CANCELLATION = 'CANCELLATION',
  RELEASE = 'RELEASE',
  RETURN = 'RETURN',
  SALE = 'SALE'
}

export type StringCustomFieldConfig = CustomField & {
  __typename?: 'StringCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  length?: Maybe<Scalars['Int']['output']>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  options?: Maybe<Array<StringFieldOption>>;
  pattern?: Maybe<Scalars['String']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type StringFieldOption = {
  __typename?: 'StringFieldOption';
  label?: Maybe<Array<LocalizedString>>;
  value: Scalars['String']['output'];
};

/** Operators for filtering on a list of String fields */
export type StringListOperators = {
  inList: Scalars['String']['input'];
};

/** Operators for filtering on a String field */
export type StringOperators = {
  contains?: InputMaybe<Scalars['String']['input']>;
  eq?: InputMaybe<Scalars['String']['input']>;
  in?: InputMaybe<Array<Scalars['String']['input']>>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  notContains?: InputMaybe<Scalars['String']['input']>;
  notEq?: InputMaybe<Scalars['String']['input']>;
  notIn?: InputMaybe<Array<Scalars['String']['input']>>;
  regex?: InputMaybe<Scalars['String']['input']>;
};

export type StringStructFieldConfig = StructField & {
  __typename?: 'StringStructFieldConfig';
  description?: Maybe<Array<LocalizedString>>;
  label?: Maybe<Array<LocalizedString>>;
  length?: Maybe<Scalars['Int']['output']>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  options?: Maybe<Array<StringFieldOption>>;
  pattern?: Maybe<Scalars['String']['output']>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type StructCustomFieldConfig = CustomField & {
  __typename?: 'StructCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  fields: Array<StructFieldConfig>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type StructField = {
  description?: Maybe<Array<LocalizedString>>;
  label?: Maybe<Array<LocalizedString>>;
  list?: Maybe<Scalars['Boolean']['output']>;
  name: Scalars['String']['output'];
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type StructFieldConfig = BooleanStructFieldConfig | DateTimeStructFieldConfig | FloatStructFieldConfig | IntStructFieldConfig | StringStructFieldConfig | TextStructFieldConfig;

/** Indicates that an operation succeeded, where we do not want to return any more specific information. */
export type Success = {
  __typename?: 'Success';
  success: Scalars['Boolean']['output'];
};

export type Surcharge = Node & {
  __typename?: 'Surcharge';
  createdAt: Scalars['DateTime']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  price: Scalars['Money']['output'];
  priceWithTax: Scalars['Money']['output'];
  sku?: Maybe<Scalars['String']['output']>;
  taxLines: Array<TaxLine>;
  taxRate: Scalars['Float']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type SurchargeInput = {
  description: Scalars['String']['input'];
  price: Scalars['Money']['input'];
  priceIncludesTax: Scalars['Boolean']['input'];
  sku?: InputMaybe<Scalars['String']['input']>;
  taxDescription?: InputMaybe<Scalars['String']['input']>;
  taxRate?: InputMaybe<Scalars['Float']['input']>;
};

export type Tag = Node & {
  __typename?: 'Tag';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  updatedAt: Scalars['DateTime']['output'];
  value: Scalars['String']['output'];
};

export type TagFilterParameter = {
  _and?: InputMaybe<Array<TagFilterParameter>>;
  _or?: InputMaybe<Array<TagFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  updatedAt?: InputMaybe<DateOperators>;
  value?: InputMaybe<StringOperators>;
};

export type TagList = PaginatedList & {
  __typename?: 'TagList';
  items: Array<Tag>;
  totalItems: Scalars['Int']['output'];
};

export type TagListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<TagFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<TagSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type TagSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type TaxCategory = Node & {
  __typename?: 'TaxCategory';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  isDefault: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type TaxCategoryFilterParameter = {
  _and?: InputMaybe<Array<TaxCategoryFilterParameter>>;
  _or?: InputMaybe<Array<TaxCategoryFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  isDefault?: InputMaybe<BooleanOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type TaxCategoryList = PaginatedList & {
  __typename?: 'TaxCategoryList';
  items: Array<TaxCategory>;
  totalItems: Scalars['Int']['output'];
};

export type TaxCategoryListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<TaxCategoryFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<TaxCategorySortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type TaxCategorySortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};

export type TaxLine = {
  __typename?: 'TaxLine';
  description: Scalars['String']['output'];
  taxRate: Scalars['Float']['output'];
};

export type TaxRate = Node & {
  __typename?: 'TaxRate';
  category: TaxCategory;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  customerGroup?: Maybe<CustomerGroup>;
  enabled: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  value: Scalars['Float']['output'];
  zone: Zone;
};

export type TaxRateFilterParameter = {
  _and?: InputMaybe<Array<TaxRateFilterParameter>>;
  _or?: InputMaybe<Array<TaxRateFilterParameter>>;
  categoryId?: InputMaybe<IdOperators>;
  createdAt?: InputMaybe<DateOperators>;
  enabled?: InputMaybe<BooleanOperators>;
  id?: InputMaybe<IdOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
  value?: InputMaybe<NumberOperators>;
  zoneId?: InputMaybe<IdOperators>;
};

export type TaxRateList = PaginatedList & {
  __typename?: 'TaxRateList';
  items: Array<TaxRate>;
  totalItems: Scalars['Int']['output'];
};

export type TaxRateListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<TaxRateFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<TaxRateSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type TaxRateSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
  value?: InputMaybe<SortOrder>;
};

export type TestEligibleShippingMethodsInput = {
  lines: Array<TestShippingMethodOrderLineInput>;
  shippingAddress: CreateAddressInput;
};

export type TestShippingMethodInput = {
  calculator: ConfigurableOperationInput;
  checker: ConfigurableOperationInput;
  lines: Array<TestShippingMethodOrderLineInput>;
  shippingAddress: CreateAddressInput;
};

export type TestShippingMethodOrderLineInput = {
  productVariantId: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
};

export type TestShippingMethodQuote = {
  __typename?: 'TestShippingMethodQuote';
  metadata?: Maybe<Scalars['JSON']['output']>;
  price: Scalars['Money']['output'];
  priceWithTax: Scalars['Money']['output'];
};

export type TestShippingMethodResult = {
  __typename?: 'TestShippingMethodResult';
  eligible: Scalars['Boolean']['output'];
  quote?: Maybe<TestShippingMethodQuote>;
};

export type TextCustomFieldConfig = CustomField & {
  __typename?: 'TextCustomFieldConfig';
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  deprecationReason?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Array<LocalizedString>>;
  internal?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  nullable?: Maybe<Scalars['Boolean']['output']>;
  readonly?: Maybe<Scalars['Boolean']['output']>;
  requiresPermission?: Maybe<Array<Permission>>;
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type TextStructFieldConfig = StructField & {
  __typename?: 'TextStructFieldConfig';
  description?: Maybe<Array<LocalizedString>>;
  label?: Maybe<Array<LocalizedString>>;
  list: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  type: Scalars['String']['output'];
  ui?: Maybe<Scalars['JSON']['output']>;
};

export type TransitionFulfillmentToStateResult = Fulfillment | FulfillmentStateTransitionError;

export type TransitionOrderToStateResult = Order | OrderStateTransitionError;

export type TransitionPaymentToStateResult = Payment | PaymentStateTransitionError;

export type UpdateActiveAdministratorInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  emailAddress?: InputMaybe<Scalars['String']['input']>;
  firstName?: InputMaybe<Scalars['String']['input']>;
  lastName?: InputMaybe<Scalars['String']['input']>;
  password?: InputMaybe<Scalars['String']['input']>;
};

/**
 * Input used to update an Address.
 *
 * The countryCode must correspond to a `code` property of a Country that has been defined in the
 * Vendure server. The `code` property is typically a 2-character ISO code such as "GB", "US", "DE" etc.
 * If an invalid code is passed, the mutation will fail.
 */
export type UpdateAddressInput = {
  city?: InputMaybe<Scalars['String']['input']>;
  company?: InputMaybe<Scalars['String']['input']>;
  countryCode?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  defaultBillingAddress?: InputMaybe<Scalars['Boolean']['input']>;
  defaultShippingAddress?: InputMaybe<Scalars['Boolean']['input']>;
  fullName?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  phoneNumber?: InputMaybe<Scalars['String']['input']>;
  postalCode?: InputMaybe<Scalars['String']['input']>;
  province?: InputMaybe<Scalars['String']['input']>;
  streetLine1?: InputMaybe<Scalars['String']['input']>;
  streetLine2?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateAdministratorInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  emailAddress?: InputMaybe<Scalars['String']['input']>;
  firstName?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  lastName?: InputMaybe<Scalars['String']['input']>;
  password?: InputMaybe<Scalars['String']['input']>;
  roleIds?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type UpdateAssetInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  focalPoint?: InputMaybe<CoordinateInput>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type UpdateChannelInput = {
  availableCurrencyCodes?: InputMaybe<Array<CurrencyCode>>;
  availableLanguageCodes?: InputMaybe<Array<LanguageCode>>;
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  defaultCurrencyCode?: InputMaybe<CurrencyCode>;
  defaultLanguageCode?: InputMaybe<LanguageCode>;
  defaultShippingZoneId?: InputMaybe<Scalars['ID']['input']>;
  defaultTaxZoneId?: InputMaybe<Scalars['ID']['input']>;
  id: Scalars['ID']['input'];
  outOfStockThreshold?: InputMaybe<Scalars['Int']['input']>;
  pricesIncludeTax?: InputMaybe<Scalars['Boolean']['input']>;
  sellerId?: InputMaybe<Scalars['ID']['input']>;
  token?: InputMaybe<Scalars['String']['input']>;
  trackInventory?: InputMaybe<Scalars['Boolean']['input']>;
};

export type UpdateChannelResult = Channel | LanguageNotAvailableError;

export type UpdateCollectionInput = {
  assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
  filters?: InputMaybe<Array<ConfigurableOperationInput>>;
  id: Scalars['ID']['input'];
  inheritFilters?: InputMaybe<Scalars['Boolean']['input']>;
  isPrivate?: InputMaybe<Scalars['Boolean']['input']>;
  parentId?: InputMaybe<Scalars['ID']['input']>;
  translations?: InputMaybe<Array<UpdateCollectionTranslationInput>>;
};

export type UpdateCollectionTranslationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  languageCode: LanguageCode;
  name?: InputMaybe<Scalars['String']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCountryInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
  translations?: InputMaybe<Array<CountryTranslationInput>>;
};

export type UpdateCustomerGroupInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCustomerInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  emailAddress?: InputMaybe<Scalars['String']['input']>;
  firstName?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  lastName?: InputMaybe<Scalars['String']['input']>;
  phoneNumber?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCustomerNoteInput = {
  note: Scalars['String']['input'];
  noteId: Scalars['ID']['input'];
};

export type UpdateCustomerResult = Customer | EmailAddressConflictError;

export type UpdateDataHubConnectionInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  config?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
  type?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateDataHubJobInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  definition?: InputMaybe<Scalars['JSON']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<DataHubJobStatus>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
  type?: InputMaybe<DataHubJobType>;
};

/** Input for updating an existing pipeline */
export type UpdateDataHubPipelineInput = {
  /** New unique code (optional) */
  code?: InputMaybe<Scalars['String']['input']>;
  /** Updated pipeline definition (optional) */
  definition?: InputMaybe<Scalars['JSON']['input']>;
  /** Enable/disable pipeline (optional) */
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  /** Pipeline ID to update */
  id: Scalars['ID']['input'];
  /** New display name (optional) */
  name?: InputMaybe<Scalars['String']['input']>;
  /** Schema version (optional) */
  version?: InputMaybe<Scalars['Int']['input']>;
};

export type UpdateDataHubSecretInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  provider?: InputMaybe<Scalars['String']['input']>;
  value?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateFacetInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
  isPrivate?: InputMaybe<Scalars['Boolean']['input']>;
  translations?: InputMaybe<Array<FacetTranslationInput>>;
};

export type UpdateFacetValueInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
  translations?: InputMaybe<Array<FacetValueTranslationInput>>;
};

export type UpdateGlobalSettingsInput = {
  availableLanguages?: InputMaybe<Array<LanguageCode>>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  outOfStockThreshold?: InputMaybe<Scalars['Int']['input']>;
  trackInventory?: InputMaybe<Scalars['Boolean']['input']>;
};

export type UpdateGlobalSettingsResult = ChannelDefaultLanguageError | GlobalSettings;

export type UpdateOrderAddressInput = {
  city?: InputMaybe<Scalars['String']['input']>;
  company?: InputMaybe<Scalars['String']['input']>;
  countryCode?: InputMaybe<Scalars['String']['input']>;
  fullName?: InputMaybe<Scalars['String']['input']>;
  phoneNumber?: InputMaybe<Scalars['String']['input']>;
  postalCode?: InputMaybe<Scalars['String']['input']>;
  province?: InputMaybe<Scalars['String']['input']>;
  streetLine1?: InputMaybe<Scalars['String']['input']>;
  streetLine2?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateOrderInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
};

/** Union type of all possible errors that can occur when adding or removing items from an Order. */
export type UpdateOrderItemErrorResult = InsufficientStockError | NegativeQuantityError | OrderInterceptorError | OrderLimitError | OrderModificationError;

export type UpdateOrderItemsResult = InsufficientStockError | NegativeQuantityError | Order | OrderInterceptorError | OrderLimitError | OrderModificationError;

export type UpdateOrderNoteInput = {
  isPublic?: InputMaybe<Scalars['Boolean']['input']>;
  note?: InputMaybe<Scalars['String']['input']>;
  noteId: Scalars['ID']['input'];
};

export type UpdatePaymentMethodInput = {
  checker?: InputMaybe<ConfigurableOperationInput>;
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  handler?: InputMaybe<ConfigurableOperationInput>;
  id: Scalars['ID']['input'];
  translations?: InputMaybe<Array<PaymentMethodTranslationInput>>;
};

export type UpdateProductInput = {
  assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  facetValueIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
  id: Scalars['ID']['input'];
  translations?: InputMaybe<Array<ProductTranslationInput>>;
};

export type UpdateProductOptionGroupInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
  translations?: InputMaybe<Array<ProductOptionGroupTranslationInput>>;
};

export type UpdateProductOptionInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
  translations?: InputMaybe<Array<ProductOptionGroupTranslationInput>>;
};

export type UpdateProductVariantInput = {
  assetIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  facetValueIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  featuredAssetId?: InputMaybe<Scalars['ID']['input']>;
  id: Scalars['ID']['input'];
  optionIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  outOfStockThreshold?: InputMaybe<Scalars['Int']['input']>;
  /** Sets the price for the ProductVariant in the Channel's default currency */
  price?: InputMaybe<Scalars['Money']['input']>;
  /** Allows multiple prices to be set for the ProductVariant in different currencies. */
  prices?: InputMaybe<Array<UpdateProductVariantPriceInput>>;
  sku?: InputMaybe<Scalars['String']['input']>;
  stockLevels?: InputMaybe<Array<StockLevelInput>>;
  stockOnHand?: InputMaybe<Scalars['Int']['input']>;
  taxCategoryId?: InputMaybe<Scalars['ID']['input']>;
  trackInventory?: InputMaybe<GlobalFlag>;
  translations?: InputMaybe<Array<ProductVariantTranslationInput>>;
  useGlobalOutOfStockThreshold?: InputMaybe<Scalars['Boolean']['input']>;
};

/**
 * Used to set up update the price of a ProductVariant in a particular Channel.
 * If the `delete` flag is `true`, the price will be deleted for the given Channel.
 */
export type UpdateProductVariantPriceInput = {
  currencyCode: CurrencyCode;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  delete?: InputMaybe<Scalars['Boolean']['input']>;
  price: Scalars['Money']['input'];
};

export type UpdatePromotionInput = {
  actions?: InputMaybe<Array<ConfigurableOperationInput>>;
  conditions?: InputMaybe<Array<ConfigurableOperationInput>>;
  couponCode?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  endsAt?: InputMaybe<Scalars['DateTime']['input']>;
  id: Scalars['ID']['input'];
  perCustomerUsageLimit?: InputMaybe<Scalars['Int']['input']>;
  startsAt?: InputMaybe<Scalars['DateTime']['input']>;
  translations?: InputMaybe<Array<PromotionTranslationInput>>;
  usageLimit?: InputMaybe<Scalars['Int']['input']>;
};

export type UpdatePromotionResult = MissingConditionsError | Promotion;

export type UpdateProvinceInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
  translations?: InputMaybe<Array<ProvinceTranslationInput>>;
};

export type UpdateRoleInput = {
  channelIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  code?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  permissions?: InputMaybe<Array<Permission>>;
};

export type UpdateScheduledTaskInput = {
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['String']['input'];
};

export type UpdateSellerInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateShippingMethodInput = {
  calculator?: InputMaybe<ConfigurableOperationInput>;
  checker?: InputMaybe<ConfigurableOperationInput>;
  code?: InputMaybe<Scalars['String']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  fulfillmentHandler?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  translations: Array<ShippingMethodTranslationInput>;
};

export type UpdateStockLocationInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateTagInput = {
  id: Scalars['ID']['input'];
  value?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateTaxCategoryInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
  isDefault?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateTaxRateInput = {
  categoryId?: InputMaybe<Scalars['ID']['input']>;
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  customerGroupId?: InputMaybe<Scalars['ID']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  value?: InputMaybe<Scalars['Float']['input']>;
  zoneId?: InputMaybe<Scalars['ID']['input']>;
};

export type UpdateZoneInput = {
  customFields?: InputMaybe<Scalars['JSON']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
};

export type User = Node & {
  __typename?: 'User';
  authenticationMethods: Array<AuthenticationMethod>;
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  identifier: Scalars['String']['output'];
  lastLogin?: Maybe<Scalars['DateTime']['output']>;
  roles: Array<Role>;
  updatedAt: Scalars['DateTime']['output'];
  verified: Scalars['Boolean']['output'];
};

export type Zone = Node & {
  __typename?: 'Zone';
  createdAt: Scalars['DateTime']['output'];
  customFields?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  members: Array<Region>;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ZoneFilterParameter = {
  _and?: InputMaybe<Array<ZoneFilterParameter>>;
  _or?: InputMaybe<Array<ZoneFilterParameter>>;
  createdAt?: InputMaybe<DateOperators>;
  id?: InputMaybe<IdOperators>;
  name?: InputMaybe<StringOperators>;
  updatedAt?: InputMaybe<DateOperators>;
};

export type ZoneList = PaginatedList & {
  __typename?: 'ZoneList';
  items: Array<Zone>;
  totalItems: Scalars['Int']['output'];
};

export type ZoneListOptions = {
  /** Allows the results to be filtered */
  filter?: InputMaybe<ZoneFilterParameter>;
  /** Specifies whether multiple top-level "filter" fields should be combined with a logical AND or OR operation. Defaults to AND. */
  filterOperator?: InputMaybe<LogicalOperator>;
  /** Skips the first n results, for use in pagination */
  skip?: InputMaybe<Scalars['Int']['input']>;
  /** Specifies which properties to sort the results by */
  sort?: InputMaybe<ZoneSortParameter>;
  /** Takes n results, for use in pagination */
  take?: InputMaybe<Scalars['Int']['input']>;
};

export type ZoneSortParameter = {
  createdAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  updatedAt?: InputMaybe<SortOrder>;
};
