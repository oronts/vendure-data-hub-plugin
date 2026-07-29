import * as React from 'react';
import { memo } from 'react';
import { useLingui } from '@lingui/react/macro';
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
    readonly canRemove?: boolean;
}

function StepListItemComponent({
    step,
    index: _index,
    isSelected,
    onClick,
    onMoveUp,
    onMoveDown,
    onRemove,
    isFirst,
    isLast,
    issueCount = 0,
    connectionCount = 0,
    canRemove = true,
}: StepListItemProps) {
    const { t } = useLingui();
    const { getStepConfig } = useStepConfigs();
    const config = getStepConfig(step.type);
    const Icon = getStepTypeIcon(step.type) ?? Play;

    const moveUpTitle = t`Move step up`;
    const moveDownTitle = t`Move step down`;
    const deleteTitle = !canRemove
        ? t`This step cannot be deleted in the current editor mode`
        : connectionCount > 0
            ? connectionCount === 1
                ? t`Delete step (${connectionCount} connection will be removed)`
                : t`Delete step (${connectionCount} connections will be removed)`
            : t`Delete step`;

    return (
        <div
            className={`group flex items-center gap-1 rounded-md p-1 transition-colors ${
                isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted'
            }`}
            data-testid={`datahub-step-item-${step.key}`}
        >
            <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 rounded p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={onClick}
                aria-pressed={isSelected}
            >
                <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs text-white"
                    style={{ backgroundColor: config?.color ?? FALLBACK_COLORS.UNKNOWN_STEP_COLOR }}
                >
                    <Icon className={ICON_SIZES.SM} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-xs">{step.key}</span>
                        {issueCount > 0 && (
                            <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                {issueCount}
                            </span>
                        )}
                        <Badge
                            variant="outline"
                            className="px-1 py-0 text-[10px]"
                            style={{ color: config?.color }}
                        >
                            {config?.label ?? step.type}
                        </Badge>
                    </div>
                    {(step.adapterCode || step.config?.adapterCode) && (
                        <p className="truncate text-xs text-muted-foreground">
                            {String(step.adapterCode || step.config?.adapterCode)}
                        </p>
                    )}
                </div>
            </button>
            <div className="flex items-center gap-0.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={onMoveUp}
                    disabled={isFirst}
                    data-testid={`datahub-step-move-up-${step.key}`}
                    title={moveUpTitle}
                    aria-label={moveUpTitle}
                >
                    <ChevronUp className={ICON_SIZES.XS} />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={onMoveDown}
                    disabled={isLast}
                    data-testid={`datahub-step-move-down-${step.key}`}
                    title={moveDownTitle}
                    aria-label={moveDownTitle}
                >
                    <ChevronDown className={ICON_SIZES.XS} />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive"
                    onClick={onRemove}
                    title={deleteTitle}
                    disabled={!canRemove}
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
