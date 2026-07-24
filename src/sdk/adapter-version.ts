import { valid } from 'semver';

export const CURRENT_ADAPTER_API_VERSION = 1;
export const BUILT_IN_ADAPTER_VERSION = '1.0.0';

export interface AdapterCompatibilityMetadata {
    readonly code: string;
    readonly version?: string;
    readonly apiVersion?: number;
}

export function validateAdapterVersion(
    adapter: AdapterCompatibilityMetadata,
    required: boolean,
): void {
    if (adapter.version === undefined) {
        if (required) {
            throw new Error(
                `Adapter '${adapter.code}' must declare an exact semantic version`,
            );
        }
    } else if (valid(adapter.version) !== adapter.version) {
        throw new Error(
            `Adapter '${adapter.code}' version must be a canonical semantic version`,
        );
    }

    if (adapter.apiVersion === undefined) {
        if (required) {
            throw new Error(
                `Adapter '${adapter.code}' must declare apiVersion ${CURRENT_ADAPTER_API_VERSION}`,
            );
        }
    } else if (
        !Number.isInteger(adapter.apiVersion)
        || adapter.apiVersion !== CURRENT_ADAPTER_API_VERSION
    ) {
        throw new Error(
            `Adapter '${adapter.code}' apiVersion must be ${CURRENT_ADAPTER_API_VERSION}`,
        );
    }
}

export function withBuiltInAdapterVersion<T extends AdapterCompatibilityMetadata>(
    adapter: T,
): T & { readonly version: string; readonly apiVersion: number } {
    return {
        ...adapter,
        version: adapter.version ?? BUILT_IN_ADAPTER_VERSION,
        apiVersion: adapter.apiVersion ?? CURRENT_ADAPTER_API_VERSION,
    };
}
