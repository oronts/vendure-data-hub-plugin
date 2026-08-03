/**
 * Custom Feed Handler
 *
 * Generates a custom feed in the configured format (JSON, CSV, TSV, or XML).
 */

import { JsonValue } from '../../../types/index';
import { getPath, recordsToCsv, recordsToXml } from '../../utils';
import { FileFormat } from '../../../constants/enums';
import { RecordObject } from '../../executor-types';
import { getErrorMessage } from '../../../utils/error.utils';
import { FeedHandlerParams, FeedHandlerResult, writeFeedFile } from './feed-handler.types';

export type CustomFeedFormat = FileFormat.JSON | FileFormat.CSV | FileFormat.TSV | FileFormat.XML;

export function resolveCustomFeedFormat(value: unknown): CustomFeedFormat {
    if (typeof value !== 'string') {
        throw new Error('Custom feed format must be JSON, CSV, TSV, or XML');
    }
    const format = value.toUpperCase();
    if (
        format !== FileFormat.JSON
        && format !== FileFormat.CSV
        && format !== FileFormat.TSV
        && format !== FileFormat.XML
    ) {
        throw new Error('Custom feed format must be JSON, CSV, TSV, or XML');
    }
    return format;
}

export function resolveCustomFeedFieldMapping(value: unknown): Record<string, string> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(
            'Custom feed fieldMapping must map non-empty output fields to source paths',
        );
    }
    const entries = Object.entries(value);
    if (
        entries.length === 0
        || entries.some(([target, source]) => (
            target.trim() !== target
            || target.length === 0
            || typeof source !== 'string'
            || source.trim() !== source
            || source.length === 0
        ))
    ) {
        throw new Error(
            'Custom feed fieldMapping must map non-empty output fields to source paths',
        );
    }
    return Object.fromEntries(entries) as Record<string, string>;
}

export async function customFeedHandler(params: FeedHandlerParams): Promise<FeedHandlerResult> {
    const { config, records, onRecordError, stepKey } = params;
    try {
        const customConfig = config as Record<string, JsonValue>;
        const format = resolveCustomFeedFormat(customConfig.format);
        const customFields = resolveCustomFeedFieldMapping(customConfig.fieldMapping);
        const items = records.map(rec => {
            const mapped: RecordObject = {};
            for (const [targetKey, sourceKey] of Object.entries(customFields)) {
                const val = getPath(rec, sourceKey);
                if (val !== undefined) mapped[targetKey] = val as JsonValue;
            }
            return mapped;
        });
        let content: string;
        switch (format) {
            case FileFormat.CSV:
                content = recordsToCsv(items as RecordObject[], ',', true);
                break;
            case FileFormat.TSV:
                content = recordsToCsv(items as RecordObject[], '\t', true);
                break;
            case FileFormat.XML:
                content = recordsToXml(items as RecordObject[], 'feed', 'item');
                break;
            case FileFormat.JSON:
                content = JSON.stringify(items, null, 2);
                break;
        }
        const filePath = await writeFeedFile(config, 'custom-feed', format.toLowerCase(), content);
        return { ok: items.length, fail: 0, outputPath: filePath };
    } catch (e: unknown) {
        const message = getErrorMessage(e);
        if (onRecordError) await onRecordError(stepKey, message, {});
        return { ok: 0, fail: records.length };
    }
}
