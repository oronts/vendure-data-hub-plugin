export function normalizeString(str: string, options?: { includeDots?: boolean }): string {
    const pattern = options?.includeDots ? /[_\-\s.]/g : /[_\-\s]/g;
    return str.toLowerCase().replace(pattern, '');
}
