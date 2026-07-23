export function normalizeString(str: string, options?: { includeDots?: boolean }): string {
    const pattern = options?.includeDots ? /[_\-\s.]/g : /[_\-\s]/g;
    return str.toLowerCase().replace(pattern, '');
}

export function getEntityLabel(entity: unknown, property: string): string {
    if (entity === null || typeof entity !== 'object' || !(property in entity)) {
        return '';
    }
    const value: unknown = Reflect.get(entity, property);
    return value == null ? '' : String(value);
}
