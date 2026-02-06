import * as React from 'react';
import { memo } from 'react';
import { Button } from '@vendure/dashboard';
import { Inbox } from 'lucide-react';
import { ICON_SIZES } from '../../../constants';
import type { EmptyStateProps } from '../../../types';

function EmptyStateComponent({
    icon,
    title,
    description,
    action,
    className = '',
}: EmptyStateProps) {
    return (
        <div
            className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}
            data-testid="empty-state"
        >
            <div className="mb-4 text-muted-foreground">
                {icon || <Inbox className={ICON_SIZES.HERO} />}
            </div>
            <h3 className="text-lg font-medium mb-1">{title}</h3>
            {description && (
                <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
            )}
            {action && (
                <Button onClick={action.onClick} variant="outline" data-testid="empty-state-action-button">
                    {action.label}
                </Button>
            )}
        </div>
    );
}

export const EmptyState = memo(EmptyStateComponent);
