import * as React from 'react';
import { usePermissions } from '@vendure/dashboard';
import { hasAllPermissions } from '../../utils/permissions';

export interface AllPermissionsGuardProps {
    requires: readonly string[];
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

export function AllPermissionsGuard({
    requires,
    children,
    fallback = null,
}: Readonly<AllPermissionsGuardProps>) {
    const { hasPermissions } = usePermissions();
    const allowed = hasAllPermissions(requires, (permission) =>
        hasPermissions([permission]),
    );
    return allowed ? children : fallback;
}
