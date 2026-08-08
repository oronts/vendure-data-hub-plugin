import type { JsonObject, JsonValue } from '../types';
import { getNestedValue } from '../utils/object-path.utils';

export function getPath(obj: JsonObject, pathStr: string): JsonValue {
    return getNestedValue(obj, pathStr ?? '') as JsonValue;
}
