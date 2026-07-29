import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    DATAHUB_FIELD_TRANSLATION_IDS,
    DATAHUB_NAV_LABELS,
    DATAHUB_PAGE_LABELS,
} from './navigation';
import {
    COMMON_VALUE_TRANSLATION_IDS,
    PIPELINE_STATUS_TRANSLATION_IDS,
    REVISION_RUN_STATUS_TRANSLATION_IDS,
    RUN_STATUS_TRANSLATION_IDS,
    SECRET_PROVIDER_TRANSLATION_IDS,
    SECRET_SOURCE_TRANSLATION_IDS,
    SECRET_STATUS_TRANSLATION_IDS,
} from './list-labels';
import { FEED_TRANSLATION_IDS } from './feed-labels';
import { DESTINATION_TRANSLATION_IDS } from './destination-labels';
import { STEP_CONFIG_TRANSLATION_IDS } from './step-config-labels';
import { SHARED_UI_TRANSLATION_IDS } from './shared-ui-labels';

const supportedLocales = ['en', 'de'] as const;
type SupportedLocale = (typeof supportedLocales)[number];

function readCatalog(locale: SupportedLocale): Map<string, string> {
    const content = readFileSync(resolve(__dirname, `../i18n/${locale}.po`), 'utf8');
    const messages = new Map<string, string>();
    const messagePattern = /^msgid "([^"]+)"\nmsgstr "([^"]+)"$/gm;

    for (const match of content.matchAll(messagePattern)) {
        messages.set(match[1], match[2]);
    }
    return messages;
}

describe('dashboard translations', () => {
    it.each(supportedLocales)('covers every registered label in %s', locale => {
        const catalog = readCatalog(locale);

        const translationIds = [
            ...Object.values(DATAHUB_NAV_LABELS),
            ...Object.values(DATAHUB_FIELD_TRANSLATION_IDS),
            ...Object.values(DATAHUB_PAGE_LABELS),
            ...Object.values(COMMON_VALUE_TRANSLATION_IDS),
            ...Object.values(PIPELINE_STATUS_TRANSLATION_IDS),
            ...Object.values(REVISION_RUN_STATUS_TRANSLATION_IDS),
            ...Object.values(RUN_STATUS_TRANSLATION_IDS),
            ...Object.values(SECRET_PROVIDER_TRANSLATION_IDS),
            ...Object.values(SECRET_SOURCE_TRANSLATION_IDS),
            ...Object.values(SECRET_STATUS_TRANSLATION_IDS),
            ...Object.values(FEED_TRANSLATION_IDS),
            ...Object.values(DESTINATION_TRANSLATION_IDS),
            ...Object.values(STEP_CONFIG_TRANSLATION_IDS),
            ...Object.values(SHARED_UI_TRANSLATION_IDS),
        ];

        for (const label of translationIds) {
            expect(catalog.get(label), `${locale} translation for ${label}`).toBeTruthy();
        }
    });
});
