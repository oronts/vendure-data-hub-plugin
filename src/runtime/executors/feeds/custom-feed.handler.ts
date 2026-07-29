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

export async function customFeedHandler(params: FeedHandlerParams): Promise<FeedHandlerResult> {
    const { config, records, onRecordError, stepKey } = params;
    try {
        const customConfig = config as Record<string, JsonValue>;
        const format = String(customConfig.format ?? FileFormat.JSON).toUpperCase();
        const customFields = customConfig.fieldMapping as Record<string, string> | undefined;
        const items = records.map(rec => {
            if (customFields) {
                const mapped: RecordObject = {};
                for (const [targetKey, sourceKey] of Object.entries(customFields)) {
                    const val = getPath(rec, sourceKey);
                    if (val !== undefined) mapped[targetKey] = val as JsonValue;
                }
                return mapped;
            }
            return rec;
        });
        let content: string;
        if (format === FileFormat.CSV) {
            content = recordsToCsv(items as RecordObject[], ',', true);
        } else if (format === FileFormat.TSV) {
            content = recordsToCsv(items as RecordObject[], '\t', true);
        } else if (format === FileFormat.XML) {
            content = recordsToXml(items as RecordObject[], 'feed', 'item');
        } else {
            content = JSON.stringify(items, null, 2);
        }
        const filePath = await writeFeedFile(config, 'custom-feed', format.toLowerCase(), content);
        return { ok: items.length, fail: 0, outputPath: filePath };
    } catch (e: unknown) {
        const message = getErrorMessage(e);
        if (onRecordError) await onRecordError(stepKey, message, {});
        return { ok: 0, fail: records.length };
    }
}
