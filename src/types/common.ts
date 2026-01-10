/**
 * Common Type Definitions
 */

/** JSON primitive types */
export type JsonPrimitive = string | number | boolean | null;

/** JSON value (recursive) */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/** JSON object */
export interface JsonObject {
    [key: string]: JsonValue;
}

/** JSON array */
export interface JsonArray extends Array<JsonValue> {}
