/**
 * Meta Catalog Feed Handler
 *
 * Generates a Meta (Facebook) product catalog feed in CSV format.
 */

import { getPath, recordsToCsv } from '../../utils';
import { getErrorMessage } from '../../../utils/error.utils';
import { FeedHandlerParams, FeedHandlerResult, formatFeedPrice, getRecordId, writeFeedFile } from './feed-handler.types';

export async function metaCatalogFeedHandler(params: FeedHandlerParams): Promise<FeedHandlerResult> {
    const { config, records, fields, onRecordError, stepKey } = params;
    try {
        const items = records.map(rec => ({
            id: getRecordId(rec),
            title: String(getPath(rec, fields.titleField) ?? ''),
            description: String(getPath(rec, fields.descriptionField) ?? ''),
            availability: String(getPath(rec, fields.availabilityField) ?? 'in stock'),
            condition: 'new',
            price: formatFeedPrice(getPath(rec, fields.priceField), fields),
            link: String(getPath(rec, fields.linkField) ?? ''),
            image_link: String(getPath(rec, fields.imageField) ?? ''),
            brand: String(getPath(rec, fields.brandField) ?? ''),
        }));
        const csv = recordsToCsv(items, ',', true);
        const filePath = await writeFeedFile(config, 'meta-catalog', 'csv', csv);
        return { ok: items.length, fail: 0, outputPath: filePath };
    } catch (e: unknown) {
        const message = getErrorMessage(e);
        if (onRecordError) await onRecordError(stepKey, message, {});
        return { ok: 0, fail: records.length };
    }
}
