import { DISALLOWED_KEYWORDS } from './code-security-patterns';

export function createCodeSandbox(
    additionalGlobals: Record<string, unknown> = {},
): Record<string, unknown> {
    const SafeArray = {
        isArray: Array.isArray.bind(Array),
        from: (arr: unknown) => {
            if (!Array.isArray(arr) && typeof arr !== 'string') {
                throw new Error('Array.from only accepts arrays or strings');
            }
            return Array.from(arr as Iterable<unknown>);
        },
        of: (...items: unknown[]) => Array.of(...items),
    };

    const SafeObject = {
        keys: (obj: object) => {
            assertObject(obj, 'Object.keys');
            return Object.keys(obj);
        },
        values: (obj: object) => {
            assertObject(obj, 'Object.values');
            return Object.values(obj);
        },
        entries: (obj: object) => {
            assertObject(obj, 'Object.entries');
            return Object.entries(obj);
        },
        assign: (target: object, ...sources: object[]) => {
            assertObject(target, 'Object.assign', ' target');
            return Object.assign({}, target, ...sources);
        },
        freeze: (obj: object) => Object.freeze(obj),
        isFrozen: (obj: object) => Object.isFrozen(obj),
        hasOwn: (obj: object, key: string) => {
            if (typeof key !== 'string') {
                throw new Error('Property key must be a string');
            }
            if (isUnsafePropertyKey(key)) {
                return false;
            }
            return Object.prototype.hasOwnProperty.call(obj, key);
        },
    };

    const SafeMath = {
        abs: Math.abs,
        ceil: Math.ceil,
        floor: Math.floor,
        round: Math.round,
        max: Math.max,
        min: Math.min,
        pow: Math.pow,
        sqrt: Math.sqrt,
        random: Math.random,
        sign: Math.sign,
        trunc: Math.trunc,
        PI: Math.PI,
        E: Math.E,
    };

    const SafeJSON = {
        parse: (text: string) => {
            if (typeof text !== 'string') {
                throw new Error('JSON.parse requires a string');
            }
            return sanitizeJsonObject(JSON.parse(text));
        },
        stringify: (value: unknown) => JSON.stringify(value),
    };

    const SafeDate = createSafeDateConstructor();
    const sandbox: Record<string, unknown> = {
        Array: SafeArray,
        Object: SafeObject,
        Math: SafeMath,
        JSON: SafeJSON,
        Date: SafeDate,
        String: (val: unknown) => String(val),
        Number: (val: unknown) => Number(val),
        Boolean: (val: unknown) => Boolean(val),
        isArray: Array.isArray,
        keys: SafeObject.keys,
        values: SafeObject.values,
        entries: SafeObject.entries,
        isNaN: Number.isNaN,
        isFinite: Number.isFinite,
        parseFloat,
        parseInt,
        encodeURI,
        decodeURI,
        encodeURIComponent,
        decodeURIComponent,
        undefined,
        NaN,
        Infinity,
        typeof: (val: unknown) => typeof val,
        isNull: (val: unknown) => val === null,
        isUndefined: (val: unknown) => val === undefined,
        isString: (val: unknown) => typeof val === 'string',
        isNumber: (val: unknown) => typeof val === 'number',
        isBoolean: (val: unknown) => typeof val === 'boolean',
        isObject: (val: unknown) => val !== null && typeof val === 'object',
        ...sanitizeAdditionalGlobals(additionalGlobals),
    };

    return deepFreeze(sandbox);
}

function createSafeDateConstructor(): DateConstructor {
    class SafeDateClass {
        private readonly _date: Date;

        constructor(value?: string | number | Date) {
            this._date = value === undefined
                ? new Date()
                : new Date(value as string | number);
        }

        getTime() { return this._date.getTime(); }
        toISOString() { return this._date.toISOString(); }
        toJSON() { return this._date.toJSON(); }
        toString() { return this._date.toString(); }
        toUTCString() { return this._date.toUTCString(); }
        toLocaleDateString(...args: Parameters<Date['toLocaleDateString']>) {
            return this._date.toLocaleDateString(...args);
        }
        toLocaleTimeString(...args: Parameters<Date['toLocaleTimeString']>) {
            return this._date.toLocaleTimeString(...args);
        }
        toLocaleString(...args: Parameters<Date['toLocaleString']>) {
            return this._date.toLocaleString(...args);
        }
        valueOf() { return this._date.valueOf(); }
        getFullYear() { return this._date.getFullYear(); }
        getMonth() { return this._date.getMonth(); }
        getDate() { return this._date.getDate(); }
        getDay() { return this._date.getDay(); }
        getHours() { return this._date.getHours(); }
        getMinutes() { return this._date.getMinutes(); }
        getSeconds() { return this._date.getSeconds(); }
        getMilliseconds() { return this._date.getMilliseconds(); }
        getTimezoneOffset() { return this._date.getTimezoneOffset(); }
        static now() { return Date.now(); }
        static parse(value: string) { return Date.parse(value); }
        static UTC(...args: Parameters<typeof Date.UTC>) { return Date.UTC(...args); }
    }

    return SafeDateClass as unknown as DateConstructor;
}

function assertObject(
    value: object,
    method: string,
    suffix = '',
): void {
    if (value === null || typeof value !== 'object') {
        throw new Error(`${method} requires an object${suffix}`);
    }
}

function sanitizeJsonObject(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(sanitizeJsonObject);
    }

    const sanitized: Record<string, unknown> = Object.create(null);
    for (const [key, value] of Object.entries(obj)) {
        if (!isUnsafePropertyKey(key)) {
            sanitized[key] = sanitizeJsonObject(value);
        }
    }
    return sanitized;
}

function sanitizeAdditionalGlobals(
    globals: Record<string, unknown>,
): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(globals)) {
        if (
            DISALLOWED_KEYWORDS.includes(key as typeof DISALLOWED_KEYWORDS[number])
            || isUnsafePropertyKey(key)
        ) {
            continue;
        }
        if (typeof value === 'function') {
            sanitized[key] = createSafeFunction(value as (...args: unknown[]) => unknown);
        } else if (value !== null && typeof value === 'object') {
            sanitized[key] = sanitizeJsonObject(value);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}

function isUnsafePropertyKey(key: string): boolean {
    return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

function createSafeFunction(
    fn: (...args: unknown[]) => unknown,
): (...args: unknown[]) => unknown {
    const wrapper = (...args: unknown[]) => fn(...args);
    Object.defineProperty(wrapper, 'constructor', {
        value: undefined,
        writable: false,
        configurable: false,
    });
    return wrapper;
}

function deepFreeze<T extends object>(obj: T): T {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) {
        const value = (obj as Record<string, unknown>)[key];
        if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
            deepFreeze(value as object);
        }
    }
    return obj;
}
