/**
 * Meta Catalog Feed Handler
 *
 * Generates a Meta (Facebook) product catalog feed in CSV format.
 */

import * as fs from 'fs';
import { getPath, recordsToCsv, ensureDirectoryExistsAsync } from '../../utils';
import { getOutputPath } from '../../../constants/index';
import { getErrorMessage } from '../../../utils/error.utils';
import { FeedHandlerParams, FeedHandlerResult, getRecordId } from './feed-handler.types';

export async function metaCatalogFeedHandler(params: FeedHandlerParams): Promise<FeedHandlerResult> {
    const { config, records, fields, onRecordError, stepKey } = params;
    try {
        const filePath = config.outputPath ?? getOutputPath('meta-catalog', 'csv');
        const items = records.map(rec => ({
            id: getRecordId(rec),
            title: String(getPath(rec, fields.titleField) ?? ''),
            description: String(getPath(rec, fields.descriptionField) ?? ''),
            availability: String(getPath(rec, fields.availabilityField) ?? 'in stock'),
            condition: 'new',
            price: `${getPath(rec, fields.priceField) ?? 0} ${fields.currency}`,
            link: String(getPath(rec, fields.linkField) ?? ''),
            image_link: String(getPath(rec, fields.imageField) ?? ''),
            brand: String(getPath(rec, fields.brandField) ?? ''),
        }));
        const csv = recordsToCsv(items, ',', true);
        await ensureDirectoryExistsAsync(filePath);
        await fs.promises.writeFile(filePath, csv, 'utf-8');
        return { ok: items.length, fail: 0, outputPath: filePath };
    } catch (e: unknown) {
        const message = getErrorMessage(e);
        if (onRecordError) await onRecordError(stepKey, message, {});
        return { ok: 0, fail: records.length };
    }
}
