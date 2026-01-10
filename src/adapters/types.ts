/**
 * Adapter Types
 *
 * Type definitions for adapters.
 */

import { RequestContext, TransactionalConnection, ProductService, ProductVariantService, CustomerService, OrderService, FacetService, FacetValueService, CollectionService, ChannelService, AssetService } from '@vendure/core';
import { JsonValue, JsonObject } from '../types/index';
import { RecordObject } from '../runtime/executor-types';

// ADAPTER TYPES

export type AdapterType = 'extractor' | 'transformer' | 'loader' | 'exporter' | 'validator';

export interface AdapterDefinition {
    code: string;
    name: string;
    type: AdapterType;
    description: string;
    configSchema?: AdapterConfigSchema;
    process: AdapterProcessFn;
}

export interface AdapterConfigSchema {
    properties: Record<string, AdapterConfigProperty>;
    required?: string[];
}

export interface AdapterConfigProperty {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'select';
    label: string;
    description?: string;
    default?: JsonValue;
    options?: { value: string; label: string }[];
    items?: AdapterConfigProperty;
}

export type AdapterProcessFn = (
    ctx: RequestContext,
    records: RecordObject[],
    config: JsonObject,
    services: AdapterServices,
) => Promise<AdapterResult>;

export interface AdapterServices {
    connection: TransactionalConnection;
    productService: ProductService;
    variantService: ProductVariantService;
    customerService: CustomerService;
    orderService: OrderService;
    facetService: FacetService;
    facetValueService: FacetValueService;
    collectionService: CollectionService;
    channelService: ChannelService;
    assetService: AssetService;
}

export interface AdapterResult {
    success: boolean;
    records: RecordObject[];
    errors?: AdapterError[];
    stats?: AdapterStats;
}

export interface AdapterError {
    index?: number;
    field?: string;
    message: string;
    code?: string;
}

export interface AdapterStats {
    processed: number;
    created?: number;
    updated?: number;
    skipped?: number;
    failed?: number;
}
