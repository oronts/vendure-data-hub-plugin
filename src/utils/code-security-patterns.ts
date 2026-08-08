import { CODE_SECURITY } from '../constants/defaults';

export interface CodeSecurityConfig {
    maxCodeLength: number;
    maxConditionLength: number;
    maxExpressionComplexity: number;
    maxPropertyAccessDepth: number;
    allowArrayMethods: boolean;
    allowStringMethods: boolean;
}

export const DEFAULT_CODE_SECURITY_CONFIG: CodeSecurityConfig = {
    maxCodeLength: CODE_SECURITY.MAX_CODE_LENGTH,
    maxConditionLength: CODE_SECURITY.MAX_CONDITION_LENGTH,
    maxExpressionComplexity: CODE_SECURITY.MAX_EXPRESSION_COMPLEXITY,
    maxPropertyAccessDepth: CODE_SECURITY.MAX_PROPERTY_ACCESS_DEPTH,
    allowArrayMethods: true,
    allowStringMethods: true,
};

export const DANGEROUS_PATTERNS = {
    STATEMENT_PATTERNS: /[;{}]|`|\$\{/,
    COMMENT_PATTERNS: /\/\/|\/\*|\*\//,
    ESCAPE_SEQUENCES: /\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\}/,
    UNICODE_ESCAPES: new RegExp(
        '['
        + String.fromCharCode(0)
        + '-'
        + String.fromCharCode(31)
        + String.fromCharCode(127)
        + '-'
        + String.fromCharCode(159)
        + String.fromCharCode(8232)
        + String.fromCharCode(8233)
        + ']',
    ),
    OCTAL_ESCAPES: /\\[0-7]{1,3}/,
    HTML_ENTITIES: /&#x?[0-9a-fA-F]+;?/i,
    BASE64_PATTERNS: /atob\s*\(|btoa\s*\(/i,
    STRING_CONCAT_TRICKS: /\[\s*['"][^'"]*['"]\s*\]\s*\(/,
    COMPUTED_PROPERTY_ACCESS: /\[\s*(?:['"`][^'"`]*['"`]\s*\+|\+\s*['"`])/,
} as const;

export const DISALLOWED_KEYWORDS = [
    'eval',
    'Function',
    'AsyncFunction',
    'GeneratorFunction',
    'AsyncGeneratorFunction',
    'require',
    'import',
    'export',
    'module',
    'exports',
    'class',
    'new',
    'extends',
    'this',
    'self',
    'globalThis',
    'window',
    'document',
    'navigator',
    'location',
    'history',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'global',
    'process',
    'Buffer',
    '__dirname',
    '__filename',
    'constructor',
    'prototype',
    '__proto__',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
    'getPrototypeOf',
    'setPrototypeOf',
    'defineProperty',
    'defineProperties',
    'getOwnPropertyDescriptor',
    'getOwnPropertyDescriptors',
    'getOwnPropertyNames',
    'getOwnPropertySymbols',
    'Reflect',
    'Proxy',
    'arguments',
    'caller',
    'callee',
    'yield',
    'async',
    'await',
    'Promise',
    'with',
    'debugger',
    'setTimeout',
    'setInterval',
    'setImmediate',
    'clearTimeout',
    'clearInterval',
    'clearImmediate',
    'queueMicrotask',
    'Symbol',
    'WeakRef',
    'FinalizationRegistry',
] as const;

export const DISALLOWED_KEYWORDS_PATTERN = new RegExp(
    `\\b(${DISALLOWED_KEYWORDS.join('|')})\\b`,
);

const SCRIPT_ALLOWED_KEYWORDS = new Set(['new', 'class', 'extends']);

const SCRIPT_DISALLOWED_KEYWORDS = DISALLOWED_KEYWORDS.filter(
    keyword => !SCRIPT_ALLOWED_KEYWORDS.has(keyword),
);

export const SCRIPT_DISALLOWED_KEYWORDS_PATTERN = new RegExp(
    `\\b(${SCRIPT_DISALLOWED_KEYWORDS.join('|')})\\b`,
    'g',
);

export const PROTOTYPE_POLLUTION_PATTERNS = [
    /__proto__/,
    /prototype\s*\[/,
    /\[\s*['"]prototype['"]\s*\]/,
    /\[\s*['"]__proto__['"]\s*\]/,
    /constructor\s*\[/,
    /\[\s*['"]constructor['"]\s*\]/,
    /\.constructor\s*\./,
    /Object\s*\.\s*prototype/,
    /Array\s*\.\s*prototype/,
    /String\s*\.\s*prototype/,
    /Number\s*\.\s*prototype/,
    /Function\s*\.\s*prototype/,
] as const;

export const SAFE_EXPRESSION_PATTERN = /^[a-zA-Z0-9_$.\s+\-*/%&|!?:=<>()[\],'"]*$/;
