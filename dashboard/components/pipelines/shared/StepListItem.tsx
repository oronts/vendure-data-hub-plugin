import * as React from 'react';
import { memo, useCallback } from 'react';
import { Button, Badge } from '@vendure/dashboard';
import { ChevronUp, ChevronDown, Trash2, Play } from 'lucide-react';
import { getStepTypeIcon, FALLBACK_COLORS, ICON_SIZES } from '../../../constants';
import { useStepConfigs } from '../../../hooks';
import type { PipelineStepDefinition } from '../../../types';

export interface StepListItemProps {
    readonly step: PipelineStepDefinition;
    readonly index: number;
    readonly isSelected: boolean;
    readonly onClick: () => void;
    readonly onMoveUp: () => void;
    readonly onMoveDown: () => void;
    readonly onRemove: () => void;
    readonly isFirst: boolean;
    readonly isLast: boolean;
    readonly issueCount?: number;
    readonly connectionCount?: number;
}

function StepListItemComponent({
    step,
    index,
    isSelected,
    onClick,
    onMoveUp,
    onMoveDown,
    onRemove,
    isFirst,
    isLast,
    issueCount = 0,
    connectionCount = 0,
}: StepListItemProps) {
    const { getStepConfig } = useStepConfigs();
    const config = getStepConfig(step.type);
    const Icon = getStepTypeIcon(step.type) ?? Play;

    const handleMoveUp = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onMoveUp();
    }, [onMoveUp]);

    const handleMoveDown = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onMoveDown();
    }, [onMoveDown]);

    const handleRemove = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onRemove();
    }, [onRemove]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
        }
    }, [onClick]);

    const deleteTitle = connectionCount > 0
        ? `Delete step (${connectionCount} connection${connectionCount > 1 ? 's' : ''} will be removed)`
        : 'Delete step';

    return (
        <div
            role="button"
            tabIndex={0}
            className={`group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted'
            }`}
            onClick={onClick}
            onKeyDown={handleKeyDown}
            data-testid={`datahub-step-item-${step.key}`}
        >
            <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs"
                style={{ backgroundColor: config?.color ?? FALLBACK_COLORS.UNKNOWN_STEP_COLOR }}
            >
                <Icon className={ICON_SIZES.SM} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-xs truncate">{step.key}</span>
                    {issueCount > 0 && (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                            {issueCount}
                        </span>
                    )}
                    <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0"
                        style={{ color: config?.color }}
                    >
                        {config?.label ?? step.type}
                    </Badge>
                </div>
                {step.config?.adapterCode && (
                    <p className="text-xs text-muted-foreground truncate">
                        {String(step.config.adapterCode)}
                    </p>
                )}
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={handleMoveUp}
                    disabled={isFirst}
                    data-testid={`datahub-step-move-up-${step.key}`}
                    aria-label="Move step up"
                >
                    <ChevronUp className={ICON_SIZES.XS} />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={handleMoveDown}
                    disabled={isLast}
                    data-testid={`datahub-step-move-down-${step.key}`}
                    aria-label="Move step down"
                >
                    <ChevronDown className={ICON_SIZES.XS} />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive"
                    onClick={handleRemove}
                    title={deleteTitle}
                    aria-label={deleteTitle}
                    data-testid={`datahub-step-remove-${step.key}`}
                >
                    <Trash2 className={ICON_SIZES.XS} />
                </Button>
            </div>
        </div>
    );
}

export const StepListItem = memo(StepListItemComponent);
