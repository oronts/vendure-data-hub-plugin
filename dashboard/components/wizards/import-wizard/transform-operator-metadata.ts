import { useMemo } from 'react';
import type { TransformTypeOption } from './constants';

export interface EnrichedTransformTypeOption extends TransformTypeOption {
    icon?: string | null;
    color?: string | null;
    category?: string | null;
}

export type OperatorData = Array<{
    code: string;
    name?: string | null;
    description?: string | null;
    category?: string | null;
    categoryLabel?: string | null;
    categoryOrder?: number | null;
    wizardHidden?: boolean | null;
    icon?: string | null;
    color?: string | null;
    schema?: {
        fields: Array<{
            key: string;
            label?: string | null;
            type: string;
            required?: boolean | null;
            defaultValue?: unknown;
            placeholder?: string | null;
            description?: string | null;
            options?: Array<{ value: string; label: string }> | null;
            group?: string | null;
            dependsOn?: {
                field: string;
                value: unknown;
                operator?: string | null;
            } | null;
            validation?: {
                min?: number | null;
                max?: number | null;
                minLength?: number | null;
                maxLength?: number | null;
                pattern?: string | null;
                patternMessage?: string | null;
            } | null;
        }>;
    };
}>;

interface CategoryColor {
    bg: string;
    border: string;
    text: string;
    accent: string;
    badge: string;
}

const CATEGORY_COLORS: Record<string, CategoryColor> = {
    DATA: { bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-400', accent: 'bg-blue-500', badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400' },
    STRING: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-400', accent: 'bg-emerald-500', badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' },
    NUMERIC: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-400', accent: 'bg-amber-500', badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' },
    DATE: { bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-800', text: 'text-purple-700 dark:text-purple-400', accent: 'bg-purple-500', badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400' },
    LOGIC: { bg: 'bg-rose-50 dark:bg-rose-950/30', border: 'border-rose-200 dark:border-rose-800', text: 'text-rose-700 dark:text-rose-400', accent: 'bg-rose-500', badge: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400' },
    VALIDATION: { bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-400', accent: 'bg-orange-500', badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400' },
    JSON: { bg: 'bg-cyan-50 dark:bg-cyan-950/30', border: 'border-cyan-200 dark:border-cyan-800', text: 'text-cyan-700 dark:text-cyan-400', accent: 'bg-cyan-500', badge: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400' },
    AGGREGATION: { bg: 'bg-indigo-50 dark:bg-indigo-950/30', border: 'border-indigo-200 dark:border-indigo-800', text: 'text-indigo-700 dark:text-indigo-400', accent: 'bg-indigo-500', badge: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400' },
    ENRICHMENT: { bg: 'bg-teal-50 dark:bg-teal-950/30', border: 'border-teal-200 dark:border-teal-800', text: 'text-teal-700 dark:text-teal-400', accent: 'bg-teal-500', badge: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400' },
    FILE: { bg: 'bg-slate-50 dark:bg-slate-950/30', border: 'border-slate-200 dark:border-slate-800', text: 'text-slate-700 dark:text-slate-400', accent: 'bg-slate-500', badge: 'bg-slate-100 dark:bg-slate-900/40 text-slate-700 dark:text-slate-400' },
    SCRIPT: { bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-200 dark:border-violet-800', text: 'text-violet-700 dark:text-violet-400', accent: 'bg-violet-500', badge: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400' },
};

const DEFAULT_CATEGORY_COLOR: CategoryColor = {
    bg: 'bg-muted',
    border: 'border-border',
    text: 'text-muted-foreground',
    accent: 'bg-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
};

export function getCategoryColor(category: string): CategoryColor {
    return CATEGORY_COLORS[category] ?? DEFAULT_CATEGORY_COLOR;
}

export function useTransformTypesFromData(
    operators: OperatorData | undefined,
): EnrichedTransformTypeOption[] {
    return useMemo(() => {
        if (!operators?.length) return [];
        return operators
            .filter(operator => operator.wizardHidden !== true)
            .map(operator => ({
                id: operator.code,
                label: operator.name ?? operator.code,
                description: operator.description ?? '',
                icon: operator.icon,
                color: operator.color,
                category: operator.category,
            }));
    }, [operators]);
}
