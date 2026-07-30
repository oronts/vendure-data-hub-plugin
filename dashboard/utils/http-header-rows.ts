export function hasHttpHeaderName(
    headers: Readonly<Record<string, string>>,
    candidateName: string,
    excludedName?: string,
): boolean {
    const normalizedCandidate = candidateName.trim().toLowerCase();
    const normalizedExcluded = excludedName?.trim().toLowerCase();

    return Object.keys(headers).some(name => {
        const normalizedName = name.toLowerCase();
        return normalizedName !== normalizedExcluded
            && normalizedName === normalizedCandidate;
    });
}

export function renameHttpHeader(
    headers: Readonly<Record<string, string>>,
    previousName: string,
    nextName: string,
): Record<string, string> {
    const normalizedNextName = nextName.trim();
    return Object.fromEntries(Object.entries(headers).map(([name, value]) => (
        name === previousName ? [normalizedNextName, value] : [name, value]
    )));
}
