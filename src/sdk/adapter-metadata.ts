import { validateAdapterVersion } from './adapter-version';

const MAX_ADAPTER_VERSION_LENGTH = 100;
const MAX_DEPRECATION_MESSAGE_LENGTH = 1000;

export interface AdapterLifecycleMetadata {
    readonly code: string;
    readonly version?: string;
    readonly apiVersion?: number;
    readonly deprecated?: boolean;
    readonly deprecatedMessage?: string;
}

export interface BatchExtractorPreviewContract {
    readonly code: string;
    readonly extractAll?: unknown;
    readonly preview?: unknown;
}

function validateTrimmedText(
    value: unknown,
    field: string,
    adapterCode: string,
    maxLength: number,
): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
        throw new Error(
            `Adapter '${adapterCode}' ${field} must be a trimmed non-empty string`,
        );
    }
    if (value.length > maxLength) {
        throw new Error(
            `Adapter '${adapterCode}' ${field} must not exceed ${maxLength} characters`,
        );
    }
    return value;
}

export function validateAdapterLifecycleMetadata(
    adapter: AdapterLifecycleMetadata,
    options: { requireVersion?: boolean } = {},
): void {
    validateTrimmedText(
        adapter.version,
        'version',
        adapter.code,
        MAX_ADAPTER_VERSION_LENGTH,
    );
    validateAdapterVersion(adapter, options.requireVersion === true);

    if (
        adapter.deprecated !== undefined
        && typeof adapter.deprecated !== 'boolean'
    ) {
        throw new Error(
            `Adapter '${adapter.code}' deprecated must be a boolean`,
        );
    }

    const message = validateTrimmedText(
        adapter.deprecatedMessage,
        'deprecatedMessage',
        adapter.code,
        MAX_DEPRECATION_MESSAGE_LENGTH,
    );
    if (adapter.deprecated === true && message === undefined) {
        throw new Error(
            `Adapter '${adapter.code}' requires deprecatedMessage when deprecated is true`,
        );
    }
    if (adapter.deprecated !== true && message !== undefined) {
        throw new Error(
            `Adapter '${adapter.code}' deprecatedMessage requires deprecated to be true`,
        );
    }
}

export function validateBatchExtractorPreview(
    adapter: BatchExtractorPreviewContract,
): void {
    if (
        typeof adapter.extractAll === 'function'
        && typeof adapter.preview !== 'function'
    ) {
        throw new Error(
            `Batch extractor '${adapter.code}' must implement preview() to provide bounded previews`,
        );
    }
}
