import * as React from 'react';
import { memo } from 'react';
import { Badge } from '@vendure/dashboard';
import type { SelectableCardProps, SelectableCardGridProps } from '../../../types';
import { ICON_SIZES } from '../../../constants';

function SelectableCardComponent({
    icon: Icon,
    title,
    description,
    badge,
    selected,
    onClick,
    disabled = false,
    className = '',
}: SelectableCardProps) {
    return (
        <button
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            className={`p-4 border rounded-lg text-left transition-all ${
                selected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'hover:border-primary/50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
            onClick={onClick}
        >
            {Icon && (
                <Icon className={`${ICON_SIZES.XL} mb-2 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
            )}
            <div className="flex items-center gap-2">
                <span className="font-medium">{title}</span>
                {badge !== undefined && (
                    <Badge variant="secondary" className="text-xs">
                        {badge}
                    </Badge>
                )}
            </div>
            {description && (
                <div className="text-xs text-muted-foreground mt-1">{description}</div>
            )}
        </button>
    );
}

export const SelectableCard = memo(SelectableCardComponent);

export function SelectableCardGrid({
    children,
    columns = 4,
    className = '',
}: SelectableCardGridProps) {
    const gridCols = {
        2: 'grid-cols-2',
        3: 'grid-cols-3',
        4: 'grid-cols-2 md:grid-cols-4',
    }[columns];

    return (
        <div className={`grid ${gridCols} gap-4 ${className}`}>
            {children}
        </div>
    );
}
