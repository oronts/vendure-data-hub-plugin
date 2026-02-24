/**
 * Amazon Feed Handler
 *
 * Generates an Amazon product feed in TSV format.
 */

import * as fs from 'fs';
import { getPath, recordsToCsv, ensureDirectoryExistsAsync } from '../../utils';
import { getOutputPath } from '../../../constants/index';
import { getErrorMessage } from '../../../utils/error.utils';
import { FeedHandlerParams, FeedHandlerResult } from './feed-handler.types';

export async function amazonFeedHandler(params: FeedHandlerParams): Promise<FeedHandlerResult> {
    const { config, records, fields, onRecordError, stepKey } = params;
    try {
        const filePath = config.outputPath ?? getOutputPath('amazon', 'txt');
        const items = records.map(rec => {
            const sku = getPath(rec, 'sku') ?? getPath(rec, 'id') ?? '';
            const stockOnHand = getPath(rec, 'stockOnHand') ?? getPath(rec, 'quantity') ?? '0';
            return {
                sku: String(sku),
                'product-id': String(getPath(rec, fields.gtinField) ?? ''),
                'product-id-type': 'UPC',
                'item-name': String(getPath(rec, fields.titleField) ?? ''),
                'item-description': String(getPath(rec, fields.descriptionField) ?? ''),
                'standard-price': String(getPath(rec, fields.priceField) ?? ''),
                'quantity': String(stockOnHand),
                'main-image-url': String(getPath(rec, fields.imageField) ?? ''),
                'brand-name': String(getPath(rec, fields.brandField) ?? ''),
            };
        });
        const tsv = recordsToCsv(items, '\t', true);
        await ensureDirectoryExistsAsync(filePath);
        await fs.promises.writeFile(filePath, tsv, 'utf-8');
        return { ok: items.length, fail: 0, outputPath: filePath };
    } catch (e: unknown) {
        const message = getErrorMessage(e);
        if (onRecordError) await onRecordError(stepKey, message, {});
        return { ok: 0, fail: records.length };
    }
}
