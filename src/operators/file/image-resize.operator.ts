import { AdapterDefinition, JsonObject, AdapterOperatorHelpers, OperatorResult } from '../types';
import { loadSharp } from './shared';

export const IMAGE_RESIZE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'imageResize',
    name: 'Image Resize',
    description: 'Resize images referenced in record fields (base64-encoded)',
    category: 'CONVERSION',
    categoryLabel: 'File',
    categoryOrder: 9,
    version: '1.0.0',
    wizardHidden: true,
    schema: {
        groups: [{ id: 'main', label: 'Resize Settings' }],
        fields: [
            { key: 'sourceField', label: 'Source Field', type: 'string', required: true, group: 'main' },
            { key: 'targetField', label: 'Target Field', type: 'string', group: 'main', description: 'Defaults to source field if not set' },
            { key: 'width', label: 'Width', type: 'number', group: 'main' },
            { key: 'height', label: 'Height', type: 'number', group: 'main' },
            {
                key: 'fit', label: 'Fit', type: 'select', group: 'main', options: [
                    { value: 'cover', label: 'Cover' },
                    { value: 'contain', label: 'Contain' },
                    { value: 'fill', label: 'Fill' },
                    { value: 'inside', label: 'Inside' },
                    { value: 'outside', label: 'Outside' },
                ],
            },
            {
                key: 'format', label: 'Output Format', type: 'select', group: 'main', options: [
                    { value: 'jpeg', label: 'JPEG' },
                    { value: 'png', label: 'PNG' },
                    { value: 'webp', label: 'WebP' },
                    { value: 'avif', label: 'AVIF' },
                ],
            },
            { key: 'quality', label: 'Quality (1-100)', type: 'number', group: 'main' },
        ],
    },
};

interface ImageResizeConfig {
    sourceField: string;
    targetField?: string;
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    format?: 'jpeg' | 'png' | 'webp' | 'avif';
    quality?: number;
}

export async function imageResizeOperator(
    records: readonly JsonObject[],
    config: ImageResizeConfig,
    _helpers: AdapterOperatorHelpers,
): Promise<OperatorResult> {
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
            let pipeline = sharp(inputBuffer);

            if (config.width || config.height) {
                pipeline = pipeline.resize({
                    width: config.width,
                    height: config.height,
                    fit: config.fit ?? 'cover',
                });
            }

            if (config.format) {
                pipeline = pipeline.toFormat(config.format, { quality: config.quality });
            }
            // If no format specified, output in original format (quality only applies with explicit format)

            const outputBuffer = await pipeline.toBuffer();
            const targetField = config.targetField ?? config.sourceField;
            output.push({ ...record, [targetField]: outputBuffer.toString('base64') });
        } catch (e: unknown) {
            // On processing error, log warning and keep original record unchanged
            // Log warning - keep original record on processing failure
            output.push({ ...record });
        }
    }

    return { records: output };
}
