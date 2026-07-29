/**
 * Amazon Feed Handler
 *
 * Generates an Amazon product feed in TSV format.
 */

import { getPath, recordsToCsv } from '../../utils';
import { getErrorMessage } from '../../../utils/error.utils';
import { FeedHandlerParams, FeedHandlerResult, formatFeedAmount, writeFeedFile } from './feed-handler.types';

export async function amazonFeedHandler(params: FeedHandlerParams): Promise<FeedHandlerResult> {
    const { config, records, fields, onRecordError, stepKey } = params;
    try {
        const items = records.map(rec => {
            const sku = getPath(rec, 'sku') ?? getPath(rec, 'id') ?? '';
            const stockOnHand = getPath(rec, 'stockOnHand') ?? getPath(rec, 'quantity') ?? '0';
            return {
                sku: String(sku),
                'product-id': String(getPath(rec, fields.gtinField) ?? ''),
                'product-id-type': 'UPC',
                'item-name': String(getPath(rec, fields.titleField) ?? ''),
                'item-description': String(getPath(rec, fields.descriptionField) ?? ''),
                'standard-price': formatFeedAmount(getPath(rec, fields.priceField), fields),
                'quantity': String(stockOnHand),
                'main-image-url': String(getPath(rec, fields.imageField) ?? ''),
                'brand-name': String(getPath(rec, fields.brandField) ?? ''),
            };
        });
        const tsv = recordsToCsv(items, '\t', true);
        const filePath = await writeFeedFile(config, 'amazon', 'txt', tsv);
        return { ok: items.length, fail: 0, outputPath: filePath };
    } catch (e: unknown) {
        const message = getErrorMessage(e);
        if (onRecordError) await onRecordError(stepKey, message, {});
        return { ok: 0, fail: records.length };
    }
}
