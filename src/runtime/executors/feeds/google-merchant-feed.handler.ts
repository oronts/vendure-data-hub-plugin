/**
 * Google Merchant Feed Handler
 *
 * Generates a Google Merchant Center product feed in XML format.
 */

import * as fs from 'fs';
import { JsonValue } from '../../../types/index';
import { xmlEscape, ensureDirectoryExistsAsync } from '../../utils';
import { FEED_NAMESPACES, EXAMPLE_URLS, getOutputPath } from '../../../constants/index';
import { getErrorMessage } from '../../../utils/error.utils';
import { FeedHandlerParams, FeedHandlerResult, mapToFeedItem } from './feed-handler.types';

export async function googleMerchantFeedHandler(params: FeedHandlerParams): Promise<FeedHandlerResult> {
    const { config, records, fields, onRecordError, stepKey } = params;
    try {
        const filePath = config.outputPath ?? getOutputPath('google-merchant', 'xml');
        const items = records.map(rec => mapToFeedItem(rec, fields));
        const shopUrl = (config as Record<string, JsonValue>).storeUrl ?? EXAMPLE_URLS.BASE;
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += `<rss version="2.0" xmlns:g="${FEED_NAMESPACES.GOOGLE_PRODUCT}">\n`;
        xml += '  <channel>\n';
        xml += `    <title>Product Feed</title>\n`;
        xml += `    <link>${xmlEscape(String(shopUrl))}</link>\n`;
        xml += `    <description>Google Merchant Center Product Feed</description>\n`;
        for (const item of items) {
            xml += '    <item>\n';
            xml += `      <g:id>${xmlEscape(item.id)}</g:id>\n`;
            xml += `      <g:title>${xmlEscape(item.title)}</g:title>\n`;
            xml += `      <g:description>${xmlEscape(item.description)}</g:description>\n`;
            xml += `      <g:link>${xmlEscape(item.link)}</g:link>\n`;
            xml += `      <g:image_link>${xmlEscape(item.image_link)}</g:image_link>\n`;
            xml += `      <g:price>${xmlEscape(item.price)}</g:price>\n`;
            xml += `      <g:brand>${xmlEscape(item.brand)}</g:brand>\n`;
            xml += `      <g:gtin>${xmlEscape(item.gtin)}</g:gtin>\n`;
            xml += `      <g:availability>${xmlEscape(item.availability)}</g:availability>\n`;
            xml += `      <g:condition>${xmlEscape(item.condition)}</g:condition>\n`;
            xml += '    </item>\n';
        }
        xml += '  </channel>\n';
        xml += '</rss>';
        await ensureDirectoryExistsAsync(filePath);
        await fs.promises.writeFile(filePath, xml, 'utf-8');
        return { ok: items.length, fail: 0, outputPath: filePath };
    } catch (e: unknown) {
        const message = getErrorMessage(e);
        if (onRecordError) await onRecordError(stepKey, message, {});
        return { ok: 0, fail: records.length };
    }
}
