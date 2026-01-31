import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@vendure/dashboard';
import type { LoadingStateProps } from '../../../types';
import { LOADING_STATE_TYPE } from '../../../constants/ui-types';
import { SKELETON_WIDTHS, ICON_SIZES } from '../../../constants';

// Deterministic skeleton width based on index
function getSkeletonWidth(index: number): number {
    return SKELETON_WIDTHS[index % SKELETON_WIDTHS.length];
}

export function LoadingState({
    type = LOADING_STATE_TYPE.SPINNER,
    rows = 3,
    message = 'Loading...',
    className = '',
}: LoadingStateProps) {
    if (type === LOADING_STATE_TYPE.SPINNER) {
        return (
            <div className={`flex items-center justify-center p-8 ${className}`}>
                <Loader2 className={`${ICON_SIZES.XL} animate-spin text-muted-foreground`} />
                {message && <span className="ml-3 text-muted-foreground">{message}</span>}
            </div>
        );
    }

    if (type === LOADING_STATE_TYPE.TABLE) {
        // Index as key is acceptable for skeleton placeholders - purely decorative, never reordered
        return (
            <div className={`space-y-3 ${className}`}>
                <div className="flex gap-4 border-b pb-2">
                    {[0, 1, 2, 3].map((colIndex) => (
                        <div
                            key={`header-${colIndex}`}
                            className="h-4 bg-muted rounded animate-pulse"
                            style={{ width: getSkeletonWidth(colIndex) }}
                        />
                    ))}
                </div>
                {Array.from({ length: rows }).map((_, rowIndex) => (
                    <div key={`row-${rowIndex}`} className="flex gap-4 py-2">
                        {[0, 1, 2, 3].map((colIndex) => (
                            <div
                                key={`cell-${colIndex}`}
                                className="h-4 bg-muted rounded animate-pulse"
                                style={{ width: getSkeletonWidth((rowIndex + colIndex) % SKELETON_WIDTHS.length) }}
                            />
                        ))}
                    </div>
                ))}
            </div>
        );
    }

    if (type === LOADING_STATE_TYPE.FORM) {
        // Index as key is acceptable for skeleton placeholders - purely decorative, never reordered
        return (
            <div className={`space-y-4 ${className}`}>
                {Array.from({ length: rows }).map((_, fieldIndex) => (
                    <div key={`field-${fieldIndex}`} className="space-y-2">
                        <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                        <div className="h-10 bg-muted rounded animate-pulse" />
                    </div>
                ))}
            </div>
        );
    }

    if (type === LOADING_STATE_TYPE.CARD) {
        // Index as key is acceptable for skeleton placeholders - purely decorative, never reordered
        return (
            <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-3 ${className}`}>
                {Array.from({ length: rows }).map((_, cardIndex) => (
                    <Card key={`card-${cardIndex}`}>
                        <CardContent className="p-4 space-y-3">
                            <div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
                            <div className="h-4 w-full bg-muted rounded animate-pulse" />
                            <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    if (type === LOADING_STATE_TYPE.LIST) {
        // Index as key is acceptable for skeleton placeholders - purely decorative, never reordered
        return (
            <div className={`space-y-2 ${className}`}>
                {Array.from({ length: rows }).map((_, itemIndex) => (
                    <div key={`item-${itemIndex}`} className="flex items-center gap-3 p-2">
                        <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
                        <div className="flex-1 space-y-1">
                            <div className="h-4 w-1/3 bg-muted rounded animate-pulse" />
                            <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return null;
}
