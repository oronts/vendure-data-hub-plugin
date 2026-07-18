type FilterObject = Record<string, unknown>;

export function buildSafePathFilter(pathFilter: string | undefined): FilterObject | undefined {
    if (!pathFilter) return undefined;

    const sanitized = pathFilter
        .replace(/["\\']/g, '')
        .replace(/[{}[\]]/g, '')
        .replace(/[^a-zA-Z0-9/\-_.]/g, '');

    if (!sanitized) return undefined;

    return { path: { $like: `${sanitized}%` } };
}

export function buildSafeMimeTypeFilter(mimeTypes: string[] | undefined): FilterObject | undefined {
    if (!mimeTypes?.length) return undefined;

    const valid = mimeTypes.filter(mt => /^[a-z]+\/[a-z0-9*+.-]+$/i.test(mt));
    if (!valid.length) return undefined;

    return { mimetype: { $in: valid } };
}

export function combineFilters(filters: (FilterObject | undefined)[]): FilterObject | undefined {
    const valid = filters.filter((f): f is FilterObject => !!f);

    if (valid.length === 0) return undefined;
    if (valid.length === 1) return valid[0];

    return { $and: valid };
}
