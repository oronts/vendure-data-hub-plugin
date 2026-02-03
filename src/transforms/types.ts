/**
 * Transform Types
 *
 * Type definitions for transform operations.
 */

import { RequestContext } from '@vendure/core';
import { TransformConfig, JsonValue, JsonObject } from '../types/index';

/**
 * Custom transform function type
 * Allows registering custom transforms from plugins
 */
export type CustomTransformFn = (
    ctx: RequestContext,
    value: JsonValue,
    config: TransformConfig,
    record?: JsonObject,
) => Promise<JsonValue> | JsonValue;

/**
 * Transform registration info
 */
export interface CustomTransformInfo {
    type: string;
    name: string;
    description: string;
    configSchema?: Record<string, JsonValue>;
    transform: CustomTransformFn;
}
