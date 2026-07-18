export function hasAllPermissions(
    requires: readonly string[],
    hasPermission: (permission: string) => boolean,
): boolean {
    return requires.every(hasPermission);
}
