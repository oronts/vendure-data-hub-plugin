import { Badge } from '@vendure/dashboard';
import { useLingui } from '@lingui/react/macro';
import { AlertTriangle } from 'lucide-react';

export function AdapterLifecycleBadges({
    version,
    deprecated,
}: Readonly<{
    version?: string | null;
    deprecated?: boolean | null;
}>) {
    const { t } = useLingui();

    if (!version && !deprecated) {
        return null;
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {version && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {version}
                </Badge>
            )}
            {deprecated && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {t`Deprecated`}
                </Badge>
            )}
        </div>
    );
}
