export function normalizeString(str: string, options?: { includeDots?: boolean }): string {
    const pattern = options?.includeDots ? /[_\-\s.]/g : /[_\-\s]/g;
    return str.toLowerCase().replace(pattern, '');
}

let keyCounter = 0;

export function generateStableKey(prefix = 'item'): string {
    return `${prefix}-${Date.now().toString(36)}-${(keyCounter++).toString(36)}`;
}
