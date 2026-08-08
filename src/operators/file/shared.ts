/**
 * Shared utilities for image operators that depend on the `sharp` library.
 *
 * Both image-resize and image-convert operators need to dynamically import
 * sharp (which uses `export = sharp`). This module centralises that logic
 * so the import quirk is handled in exactly one place.
 */

import { JsonObject, OperatorResult } from '../types';
import { deepClone, getNestedValue, setNestedValue } from '../helpers';
import { getErrorMessage } from '../../utils/error.utils';

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
): Promise<OperatorResult> {
    const sharp = await loadSharp();
    const output: JsonObject[] = [];
    const errors: NonNullable<OperatorResult['errors']> = [];

    for (const [index, record] of records.entries()) {
        const result = deepClone(record);
        const sourceValue = getNestedValue(record, config.sourceField);
        if (sourceValue === undefined || sourceValue === null || sourceValue === '') {
            output.push(result);
            continue;
        }

        try {
            if (typeof sourceValue !== 'string') {
                throw new Error('Source field must contain a base64-encoded string');
            }
            const inputBuffer = Buffer.from(sourceValue, 'base64');
            if (inputBuffer.length === 0) {
                throw new Error('Source field contains empty base64 data');
            }

            const outputBuffer = await processPipeline(sharp, inputBuffer, config);
            const targetField = config.targetField ?? config.sourceField;
            setNestedValue(result, targetField, outputBuffer.toString('base64'));
        } catch (error) {
            errors.push({
                message: getErrorMessage(error),
                field: config.sourceField,
                index,
            });
        }
        output.push(result);
    }

    return {
        records: output,
        ...(errors.length > 0 ? { errors } : {}),
    };
}
