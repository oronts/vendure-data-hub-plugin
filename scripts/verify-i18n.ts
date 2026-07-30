import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { formatter } from '@lingui/format-po';

const root = resolve(__dirname, '..');
const locales = ['en', 'de'] as const;

async function readCatalog(locale: string) {
    const filename = resolve(root, 'dashboard/i18n', `${locale}.po`);
    const content = await readFile(filename, 'utf8');
    return formatter().parse(content, {
        locale,
        sourceLocale: locales[0],
        filename,
    });
}

async function main(): Promise<void> {
    const catalogs = await Promise.all(
        locales.map(async locale => ({ locale, catalog: await readCatalog(locale) })),
    );
    const expectedIds = Object.entries(catalogs[0].catalog)
        .filter(([, message]) => !message.obsolete)
        .map(([id]) => id)
        .sort();
    const failures: string[] = [];

    for (const { locale, catalog } of catalogs) {
        const activeEntries = Object.entries(catalog)
            .filter(([, message]) => !message.obsolete);
        const ids = activeEntries.map(([id]) => id).sort();
        if (ids.join('\n') !== expectedIds.join('\n')) {
            failures.push(`${locale}: message IDs differ from ${locales[0]}`);
        }
        for (const [id, message] of activeEntries) {
            if (message.translation.trim().length === 0) {
                failures.push(`${locale}: empty translation for ${id}`);
            }
            const flags = message.extra?.['flags'];
            if (Array.isArray(flags) && flags.includes('fuzzy')) {
                failures.push(`${locale}: fuzzy translation for ${id}`);
            }
        }
    }

    if (failures.length > 0) {
        throw new Error(failures.join('\n'));
    }
    process.stdout.write(
        `Verified ${expectedIds.length} Lingui messages in ${locales.join(', ')}\n`,
    );
}

void main();
