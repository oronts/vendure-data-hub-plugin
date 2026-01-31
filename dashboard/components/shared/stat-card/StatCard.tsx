import * as React from 'react';
import { memo } from 'react';
import { Card, CardContent, Skeleton } from '@vendure/dashboard';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../../../utils';
import { TREND_DIRECTION, ICON_SIZES } from '../../../constants';
import type { StatCardProps } from '../../../types';

const VARIANT_STYLES: Record<string, string> = {
    default: 'bg-card',
    success: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
    warning: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
    error: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
    info: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
};

const VALUE_STYLES: Record<string, string> = {
    default: 'text-foreground',
    success: 'text-emerald-700 dark:text-emerald-400',
    warning: 'text-amber-700 dark:text-amber-400',
    error: 'text-red-700 dark:text-red-400',
    info: 'text-blue-700 dark:text-blue-400',
};

const TREND_STYLES: Record<string, string> = {
    up: 'text-emerald-600 dark:text-emerald-400',
    down: 'text-red-600 dark:text-red-400',
    neutral: 'text-muted-foreground',
};

function StatCardComponent({
    title,
    value,
    subtitle,
    icon,
    trend,
    variant = 'default',
    isLoading = false,
    onClick,
    className,
}: StatCardProps) {
    const TrendIcon =
        trend?.direction === TREND_DIRECTION.UP
            ? TrendingUp
            : trend?.direction === TREND_DIRECTION.DOWN
              ? TrendingDown
              : Minus;

    if (isLoading) {
        return (
            <Card className={cn(VARIANT_STYLES[variant], className)}>
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-8 w-16" />
                        </div>
                        <Skeleton className="h-10 w-10 rounded-full" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    const content = (
        <CardContent className="p-4">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">{title}</p>
                    <p className={cn('text-2xl font-bold', VALUE_STYLES[variant])}>{value}</p>
                    {subtitle && (
                        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
                    )}
                    {trend && (
                        <div
                            className={cn(
                                'flex items-center gap-1 mt-1 text-xs',
                                TREND_STYLES[trend.direction]
                            )}
                        >
                            <TrendIcon className={ICON_SIZES.XS} />
                            <span>{trend.label ?? `${Math.abs(trend.value)}%`}</span>
                        </div>
                    )}
                </div>
                {icon && (
                    <div className="p-2.5 rounded-full bg-muted/50 text-muted-foreground">
                        {icon}
                    </div>
                )}
            </div>
        </CardContent>
    );

    return (
        <Card
            className={cn(
                VARIANT_STYLES[variant],
                onClick && 'cursor-pointer hover:shadow-md transition-shadow',
                className
            )}
            onClick={onClick}
        >
            {content}
        </Card>
    );
}

export const StatCard = memo(StatCardComponent);
