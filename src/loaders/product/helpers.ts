import { ID, RequestContext, FacetValueService } from '@vendure/core';
import { DataHubLogger } from '../../services/logger';
import { TRANSFORM_LIMITS } from '../../constants/defaults';

export async function resolveFacetValueIds(
    ctx: RequestContext,
    facetValueService: FacetValueService,
    codes: string[],
    logger: DataHubLogger,
): Promise<ID[]> {
    if (!codes || codes.length === 0) return [];

    const ids: ID[] = [];
    const facetValues = await facetValueService.findAll(ctx.languageCode);

    for (const code of codes) {
        const fv = facetValues.find((f: { code: string; name: string; id: ID }) => f.code === code || f.name === code);
        if (fv) {
            ids.push(fv.id);
        } else {
            logger.warn(`Facet value "${code}" not found`);
        }
    }

    return ids;
}

export function slugify(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, TRANSFORM_LIMITS.SLUG_MAX_LENGTH);
}

export function isRecoverableError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
            message.includes('timeout') ||
            message.includes('connection') ||
            message.includes('temporarily')
        );
    }
    return false;
}

export function shouldUpdateField(
    field: string,
    updateOnlyFields?: string[],
): boolean {
    if (!updateOnlyFields || updateOnlyFields.length === 0) {
        return true;
    }
    return updateOnlyFields.includes(field);
}
