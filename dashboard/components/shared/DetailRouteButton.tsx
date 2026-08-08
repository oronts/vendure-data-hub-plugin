import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@vendure/dashboard';
import { ChevronRight } from 'lucide-react';

export interface DetailRouteButtonProps {
    readonly id: string | number;
    readonly label: ReactNode;
    readonly route: string;
}

export function DetailRouteButton({
    id,
    label,
    route,
}: Readonly<DetailRouteButtonProps>) {
    return (
        <Button asChild variant="ghost">
            <Link
                to={route}
                params={{ id: String(id) }}
                preload={false}
            >
                {label}
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </Link>
        </Button>
    );
}
