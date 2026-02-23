/**
 * Shared utilities for image operators that depend on the `sharp` library.
 *
 * Both image-resize and image-convert operators need to dynamically import
 * sharp (which uses `export = sharp`). This module centralises that logic
 * so the import quirk is handled in exactly one place.
 */

import { JsonObject } from '../../types';

export type SharpFn = typeof import('sharp');

export async function loadSharp(): Promise<SharpFn> {
    try {
        // sharp uses `export = sharp`, so dynamic import yields { default: sharp }
        const mod = await import('sharp') as { default: SharpFn };
        return mod.default;
    } catch {
        throw new Error(
            'The "sharp" package is required for image operations. Install it with: npm install sharp',
        );
    }
}

/**
 * Shared helper for processing base64-encoded image records with Sharp.
 * Consolidates the common loop pattern used by image-resize and image-convert operators.
 */
export async function processImageRecords<C extends { sourceField: string; targetField?: string }>(
    records: readonly JsonObject[],
    config: C,
    processPipeline: (sharp: SharpFn, inputBuffer: Buffer, config: C) => Promise<Buffer>,
): Promise<JsonObject[]> {
    const sharp = await loadSharp();
    const output: JsonObject[] = [];

    for (const record of records) {
        const sourceValue = record[config.sourceField];
        if (!sourceValue || typeof sourceValue !== 'string') {
            output.push({ ...record });
            continue;
        }

        try {
            const inputBuffer = Buffer.from(sourceValue, 'base64');
            if (inputBuffer.length === 0) {
                output.push({ ...record });
                continue;
            }

            const outputBuffer = await processPipeline(sharp, inputBuffer, config);
            const targetField = config.targetField ?? config.sourceField;
            output.push({ ...record, [targetField]: outputBuffer.toString('base64') });
        } catch {
            // On processing error, keep original record unchanged
            output.push({ ...record });
        }
    }

    return output;
}
