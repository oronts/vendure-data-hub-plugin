import { JsonValue, BaseOperatorConfig } from '../types';

export interface MapOperatorConfig extends BaseOperatorConfig {
    readonly mapping: Record<string, string>;
    readonly passthrough?: boolean;
}

export interface SetOperatorConfig extends BaseOperatorConfig {
    readonly path: string;
    readonly value: JsonValue;
}

export interface RemoveOperatorConfig extends BaseOperatorConfig {
    readonly path: string;
}

export interface RenameOperatorConfig extends BaseOperatorConfig {
    readonly from: string;
    readonly to: string;
}

export interface CopyOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly target: string;
}

export interface TemplateOperatorConfig extends BaseOperatorConfig {
    readonly template: string;
    readonly target: string;
    readonly missingAsEmpty?: boolean;
}

/**
 * Hash algorithm types supported by the hash operator.
 */
export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha512';

/**
 * Configuration for generating hash of field values.
 */
export interface HashOperatorConfig extends BaseOperatorConfig {
    /** Source field path(s) - single path or array of paths to hash together */
    readonly source: string | string[];
    /** Target field path for the hash result */
    readonly target: string;
    /** Hash algorithm: md5, sha1, sha256, sha512. Default: sha256 */
    readonly algorithm?: HashAlgorithm;
    /** Output encoding: hex, base64. Default: hex */
    readonly encoding?: 'hex' | 'base64';
}

/**
 * Configuration for generating UUIDs.
 */
export interface UuidOperatorConfig extends BaseOperatorConfig {
    /** Target field path for the UUID */
    readonly target: string;
    /** UUID version: v4 (random), v5 (namespace-based). Default: v4 */
    readonly version?: 'v4' | 'v5';
    /** Namespace UUID for v5 (required for v5) */
    readonly namespace?: string;
    /** Source field path for v5 name (required for v5) */
    readonly source?: string;
}
