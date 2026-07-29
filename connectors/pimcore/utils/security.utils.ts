type FilterObject = Record<string, unknown>;

const MAX_PIMCORE_PATH_LENGTH = 2_048;

function hasInvalidPathCharacter(path: string): boolean {
    return [...path].some(character => {
        const codePoint = character.codePointAt(0);
        return character === '%' || codePoint === 127 || (codePoint !== undefined && codePoint < 32);
    });
}

export function buildSafePathFilter(pathFilter: string | undefined): FilterObject | undefined {
    if (pathFilter === undefined) return undefined;
    if (
        !pathFilter.startsWith('/')
        || pathFilter.length > MAX_PIMCORE_PATH_LENGTH
        || hasInvalidPathCharacter(pathFilter)
    ) {
        throw new Error(
            'Pimcore path filters must be absolute paths without control or wildcard characters',
        );
    }

    return { fullpath: { $like: `${pathFilter}%` } };
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
