/**
 * Built-in Custom Transforms
 *
 * Pre-built custom transforms that are registered on module init.
 * These extend the built-in transforms with additional functionality
 * not covered by the standard field transforms.
 */

import * as crypto from 'crypto';
import { RequestContext } from '@vendure/core';
import { CustomTransformInfo } from './types';
import { JsonValue } from '../types/index';

// HASH TRANSFORMS

/**
 * MD5 Hash transform
 */
export const hashMd5Transform: CustomTransformInfo = {
    type: 'HASH_MD5',
    name: 'MD5 Hash',
    description: 'Generate MD5 hash of the value',
    transform: async (_ctx: RequestContext, value: JsonValue) => {
        if (typeof value !== 'string') return value;
        return crypto.createHash('md5').update(value).digest('hex');
    },
};

/**
 * SHA256 Hash transform
 */
export const hashSha256Transform: CustomTransformInfo = {
    type: 'HASH_SHA256',
    name: 'SHA256 Hash',
    description: 'Generate SHA256 hash of the value',
    transform: async (_ctx: RequestContext, value: JsonValue) => {
        if (typeof value !== 'string') return value;
        return crypto.createHash('sha256').update(value).digest('hex');
    },
};

// URL ENCODING TRANSFORMS

/**
 * URL Encode transform
 */
export const urlEncodeTransform: CustomTransformInfo = {
    type: 'URL_ENCODE',
    name: 'URL Encode',
    description: 'URL-encode the value',
    transform: (ctx: RequestContext, value: JsonValue) => {
        if (typeof value !== 'string') return value;
        return encodeURIComponent(value);
    },
};

/**
 * URL Decode transform
 */
export const urlDecodeTransform: CustomTransformInfo = {
    type: 'URL_DECODE',
    name: 'URL Decode',
    description: 'URL-decode the value',
    transform: (ctx: RequestContext, value: JsonValue) => {
        if (typeof value !== 'string') return value;
        try {
            return decodeURIComponent(value);
        } catch {
            return value;
        }
    },
};

// BASE64 ENCODING TRANSFORMS

/**
 * Base64 Encode transform
 */
export const base64EncodeTransform: CustomTransformInfo = {
    type: 'BASE64_ENCODE',
    name: 'Base64 Encode',
    description: 'Base64-encode the value',
    transform: (ctx: RequestContext, value: JsonValue) => {
        if (typeof value !== 'string') return value;
        return Buffer.from(value).toString('base64');
    },
};

/**
 * Base64 Decode transform
 */
export const base64DecodeTransform: CustomTransformInfo = {
    type: 'BASE64_DECODE',
    name: 'Base64 Decode',
    description: 'Base64-decode the value',
    transform: (ctx: RequestContext, value: JsonValue) => {
        if (typeof value !== 'string') return value;
        try {
            return Buffer.from(value, 'base64').toString('utf-8');
        } catch {
            return value;
        }
    },
};

// WHITESPACE TRANSFORMS

/**
 * Clean Whitespace transform
 */
export const cleanWhitespaceTransform: CustomTransformInfo = {
    type: 'CLEAN_WHITESPACE',
    name: 'Clean Whitespace',
    description: 'Normalize whitespace (trim and collapse multiple spaces)',
    transform: (ctx: RequestContext, value: JsonValue) => {
        if (typeof value !== 'string') return value;
        return value.trim().replace(/\s+/g, ' ');
    },
};

// EXPORT ALL TRANSFORMS

/**
 * All built-in custom transforms
 */
export const BUILTIN_CUSTOM_TRANSFORMS: CustomTransformInfo[] = [
    hashMd5Transform,
    hashSha256Transform,
    urlEncodeTransform,
    urlDecodeTransform,
    base64EncodeTransform,
    base64DecodeTransform,
    cleanWhitespaceTransform,
];
