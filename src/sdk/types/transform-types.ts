/**
 * Transform Types - SDK types for data transformation and operators
 */

import { JsonValue, JsonObject } from '../../types/index';
import { OperatorContext } from './adapter-types';

export {
    FilterCondition,
    FilterConfig,
    FieldMapping,
    FieldTransform,
    MappingConfig,
    AggregationFunction,
    AggregationConfig,
    TransformStep,
} from '../../../shared/types';

export type LookupEntity =
    | 'product'
    | 'variant'
    | 'customer'
    | 'collection'
    | 'facet'
    | 'facetValue'
    | 'asset'
    | 'order'
    | 'promotion'
    | 'channel'
    | 'taxCategory';

export interface FormatHelpers {
    currency(amount: number, currencyCode: string, locale?: string): string;
    date(date: Date | string | number, format: string): string;
    number(value: number, decimals?: number, locale?: string): string;
    template(template: string, data: JsonObject): string;
}

export type UnitType =
    | 'g' | 'kg' | 'lb' | 'oz'
    | 'cm' | 'm' | 'mm' | 'in' | 'ft'
    | 'ml' | 'l' | 'gal'
    | 'c' | 'f' | 'k';

export interface ConversionHelpers {
    toMinorUnits(amount: number, decimals?: number): number;
    fromMinorUnits(amount: number, decimals?: number): number;
    unit(value: number, from: UnitType, to: UnitType): number;
    parseDate(value: string, format?: string): Date | null;
}

export interface CryptoHelpers {
    hash(value: string, algorithm?: 'md5' | 'sha256' | 'sha512'): string;
    hmac(value: string, secret: string, algorithm?: 'sha256' | 'sha512'): string;
    uuid(): string;
}

export interface OperatorSecretResolver {
    get(code: string): Promise<string | undefined>;
}

export interface OperatorHelpers {
    readonly ctx: OperatorContext;
    readonly secrets?: OperatorSecretResolver;
    get(record: JsonObject, path: string): JsonValue | undefined;
    set(record: JsonObject, path: string, value: JsonValue): void;
    remove(record: JsonObject, path: string): void;
    lookup<T = JsonValue>(
        entity: LookupEntity,
        by: Record<string, JsonValue>,
        select?: string | readonly string[]
    ): Promise<T | undefined>;
    format: FormatHelpers;
    convert: ConversionHelpers;
    crypto: CryptoHelpers;
}

