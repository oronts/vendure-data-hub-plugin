import * as React from 'react';
import { memo } from 'react';
import { Card, CardContent } from '@vendure/dashboard';
import type { SummaryCardProps, SummaryCardGridProps } from '../../../types';
import { ICON_SIZES } from '../../../constants';

interface SummaryFieldProps {
    label: string;
    children: React.ReactNode;
    colSpan?: 2;
    className?: string;
}

export function SummaryField({ label, children, colSpan, className }: SummaryFieldProps) {
    return (
        <div className={colSpan === 2 ? 'col-span-2' : undefined}>
            <span className="text-muted-foreground">{label}:</span>
            <span className={`ml-2 font-medium${className ? ` ${className}` : ''}`}>{children}</span>
        </div>
    );
}

function SummaryCardComponent({ icon: Icon, label, value, className = '' }: SummaryCardProps) {
    return (
        <Card className={className}>
            <CardContent className="p-4 text-center">
                <Icon className={`${ICON_SIZES.XL} mx-auto mb-2 text-primary`} />
                <div className="font-medium">{label}</div>
                <div className="text-sm text-muted-foreground">{value}</div>
            </CardContent>
        </Card>
    );
}

export const SummaryCard = memo(SummaryCardComponent);

export function SummaryCardGrid({
    children,
    columns = 4,
    className = '',
}: SummaryCardGridProps) {
    const colClass = {
        2: 'grid-cols-2',
        3: 'grid-cols-2 md:grid-cols-3',
        4: 'grid-cols-2 md:grid-cols-4',
    }[columns];

    return (
        <div className={`grid ${colClass} gap-4 ${className}`}>
            {children}
        </div>
    );
}
