import { ID, RequestContext, ZoneService, CurrencyCode, LanguageCode } from '@vendure/core';

export { isRecoverableError, shouldUpdateField } from '../shared-helpers';

/**
 * Resolve zone ID from code or direct ID
 */
export async function resolveZoneId(
    ctx: RequestContext,
    zoneService: ZoneService,
    zoneCode?: string,
    zoneId?: string | number,
    cache?: Map<string, ID>,
): Promise<ID | null> {
    // Try ID first
    if (zoneId) {
        return zoneId as ID;
    }

    if (!zoneCode) {
        return null;
    }

    // Check cache
    if (cache?.has(`zone:${zoneCode}`)) {
        return cache.get(`zone:${zoneCode}`)!;
    }

    // Look up by code/name
    const zones = await zoneService.findAll(ctx);
    const match = zones.items.find(
        z => z.name.toLowerCase() === zoneCode.toLowerCase()
    );

    if (match) {
        cache?.set(`zone:${zoneCode}`, match.id);
        return match.id;
    }

    return null;
}

/**
 * Parse and validate currency code
 */
export function parseCurrencyCode(code: string): CurrencyCode | null {
    // Vendure uses uppercase 3-letter currency codes
    const normalized = code.toUpperCase().trim();

    // Basic validation - should be 3 uppercase letters
    if (!/^[A-Z]{3}$/.test(normalized)) {
        return null;
    }

    return normalized as CurrencyCode;
}

/**
 * Parse and validate language code
 */
export function parseLanguageCode(code: string): LanguageCode | null {
    // Vendure uses lowercase 2-letter language codes
    const normalized = code.toLowerCase().trim();

    // Basic validation - should be 2 lowercase letters
    if (!/^[a-z]{2}$/.test(normalized)) {
        return null;
    }

    return normalized as LanguageCode;
}

/**
 * Parse array of currency codes
 */
export function parseCurrencyCodes(codes: string[]): CurrencyCode[] {
    return codes
        .map(parseCurrencyCode)
        .filter((code): code is CurrencyCode => code !== null);
}

/**
 * Parse array of language codes
 */
export function parseLanguageCodes(codes: string[]): LanguageCode[] {
    return codes
        .map(parseLanguageCode)
        .filter((code): code is LanguageCode => code !== null);
}

/**
 * Generate a unique channel token
 */
export function generateChannelToken(code: string): string {
    const randomPart = Math.random().toString(36).substring(2, 10);
    return `${code.toLowerCase().replace(/[^a-z0-9]/g, '')}_${randomPart}`;
}

