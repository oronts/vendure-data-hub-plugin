import { memo, useCallback, useMemo } from 'react';
import { Trans } from '@lingui/react/macro';
import { resolveIconName } from '../../../utils/icon-resolver';
import type { TransformationType } from './types';
import {
    type EnrichedTransformTypeOption,
    getCategoryColor,
    type OperatorData,
} from './transform-operator-metadata';

interface OperatorGroup {
    category: string;
    label: string;
    order: number;
    operators: EnrichedTransformTypeOption[];
}

interface TransformTypeButtonsProps {
    onAdd: (type: TransformationType) => void;
    operators: OperatorData | undefined;
}

const LOADING_OPERATOR_COUNT = 10;

function useTransformGroupsFromData(operators: OperatorData | undefined): OperatorGroup[] {
    return useMemo(() => {
        if (!operators?.length) return [];
        const groups = new Map<string, Omit<OperatorGroup, 'category'>>();

        for (const operator of operators) {
            if (operator.wizardHidden === true) continue;
            const category = operator.category ?? 'DATA';
            let group = groups.get(category);
            if (!group) {
                group = {
                    label: operator.categoryLabel ?? category,
                    order: operator.categoryOrder ?? 999,
                    operators: [],
                };
                groups.set(category, group);
            }
            group.operators.push({
                id: operator.code,
                label: operator.name ?? operator.code,
                description: operator.description ?? '',
                icon: operator.icon,
                color: operator.color,
                category,
            });
        }

        return Array.from(groups, ([category, group]) => ({ category, ...group }))
            .sort((left, right) => left.order - right.order);
    }, [operators]);
}

export function TransformTypeButtons({ onAdd, operators }: TransformTypeButtonsProps) {
    const groups = useTransformGroupsFromData(operators);

    if (!operators) {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2" data-testid="datahub-transform-type-buttons">
                {Array.from({ length: LOADING_OPERATOR_COUNT }, (_, index) => (
                    <div key={`loading-${index}`} className="h-auto py-2 px-2.5 flex items-start gap-2 rounded-md border border-muted animate-pulse">
                        <div className="w-5 h-5 bg-muted rounded mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <div className="h-3 bg-muted rounded w-3/4 mb-1" />
                            <div className="h-2 bg-muted rounded w-full" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (groups.length === 0) {
        return (
            <div className="text-sm text-muted-foreground p-4 text-center" data-testid="datahub-transform-type-buttons">
                <Trans>No operator types available</Trans>
            </div>
        );
    }

    return (
        <div className="space-y-4" data-testid="datahub-transform-type-buttons">
            {groups.map(group => {
                const colors = getCategoryColor(group.category);
                return (
                    <div key={group.category}>
                        <div className="flex items-center gap-2 mb-2">
                            <div className={`w-1.5 h-4 rounded-full ${colors.accent}`} />
                            <h4 className={`text-xs font-semibold uppercase tracking-wider ${colors.text}`}>
                                {group.label}
                            </h4>
                            <span className="text-[10px] text-muted-foreground">
                                ({group.operators.length})
                            </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                            {group.operators.map(type => (
                                <TransformTypeButton
                                    key={type.id}
                                    type={type}
                                    category={group.category}
                                    onAdd={onAdd}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

interface TransformTypeButtonProps {
    type: EnrichedTransformTypeOption;
    category?: string;
    onAdd: (type: TransformationType) => void;
}

const TransformTypeButton = memo(function TransformTypeButton({
    type,
    category,
    onAdd,
}: TransformTypeButtonProps) {
    const handleClick = useCallback(() => {
        onAdd(type.id as TransformationType);
    }, [type.id, onAdd]);
    const IconComponent = resolveIconName(type.icon ?? undefined);
    const colors = getCategoryColor(category ?? type.category ?? 'DATA');

    return (
        <button
            type="button"
            className={`group relative h-auto py-2 px-2.5 flex items-start gap-2 text-left rounded-md border transition-all duration-150 ${colors.border} ${colors.bg} hover:shadow-sm hover:scale-[1.02] active:scale-[0.98]`}
            onClick={handleClick}
            title={type.description}
            data-testid={`datahub-transform-add-${type.id}-button`}
        >
            {IconComponent && (
                <div className={`shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center ${colors.badge}`}>
                    <IconComponent className="w-3 h-3" />
                </div>
            )}
            <div className="min-w-0 flex-1">
                <span className="text-xs font-medium leading-tight block">{type.label}</span>
                <span className="text-[10px] text-muted-foreground leading-tight line-clamp-2">{type.description}</span>
            </div>
        </button>
    );
});
