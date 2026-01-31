import * as React from 'react';
import { useRef, useCallback } from 'react';
import {
    Button,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Badge,
} from '@vendure/dashboard';
import { Plus, Trash2 } from 'lucide-react';
import { COMPARISON_OPERATORS, COMPONENT_WIDTHS, SENTINEL_VALUES } from '../../../constants';
import type { FilterCondition, FilterOperator } from '../../../types';
import { generateStableKey } from '../../../utils';

function useConditionKeys(conditions: FilterCondition[]): string[] {
    const keysRef = useRef<Map<FilterCondition, string>>(new Map());
    const prevConditionsRef = useRef<FilterCondition[]>([]);

    if (prevConditionsRef.current !== conditions) {
        const newMap = new Map<FilterCondition, string>();
        for (const condition of conditions) {
            const existingKey = keysRef.current.get(condition);
            newMap.set(condition, existingKey ?? generateStableKey('condition'));
        }
        keysRef.current = newMap;
        prevConditionsRef.current = conditions;
    }

    return conditions.map(c => keysRef.current.get(c) ?? generateStableKey('condition'));
}

export interface FilterConditionsEditorProps {
    /** Array of filter conditions */
    conditions: FilterCondition[];
    /** Called when conditions change */
    onChange: (conditions: FilterCondition[]) => void;
    /** Available fields to filter on */
    fields: string[];
    /** Logic operator between conditions (AND/OR) */
    logic?: 'AND' | 'OR';
    /** Called when logic changes */
    onLogicChange?: (logic: 'AND' | 'OR') => void;
    /** Show logic selector */
    showLogicSelector?: boolean;
    /** Placeholder for field selector */
    fieldPlaceholder?: string;
    /** Placeholder for value input */
    valuePlaceholder?: string;
    /** Empty state message */
    emptyMessage?: string;
    /** Add button label */
    addLabel?: string;
    /** Compact mode */
    compact?: boolean;
}

/**
 * Shared component for editing filter conditions.
 * Used by pipeline editors and wizards for consistent filter UI.
 *
 * This is the single source of truth for filter condition editing.
 * Use this instead of inline filter UIs.
 */
export function FilterConditionsEditor({
    conditions,
    onChange,
    fields,
    logic = 'AND',
    onLogicChange,
    showLogicSelector = true,
    fieldPlaceholder = 'Select field...',
    valuePlaceholder = 'Value',
    emptyMessage = 'No conditions - all rows pass through',
    addLabel = 'Add Condition',
    compact = false,
}: FilterConditionsEditorProps) {
    const conditionKeys = useConditionKeys(conditions);

    const addCondition = useCallback(() => {
        onChange([...conditions, { field: '', operator: 'eq' as FilterOperator, value: '' }]);
    }, [conditions, onChange]);

    const updateCondition = useCallback((index: number, updates: Partial<FilterCondition>) => {
        const newConditions = [...conditions];
        newConditions[index] = { ...newConditions[index], ...updates };
        onChange(newConditions);
    }, [conditions, onChange]);

    const removeCondition = useCallback((index: number) => {
        onChange(conditions.filter((_, i) => i !== index));
    }, [conditions, onChange]);

    return (
        <div className={compact ? 'space-y-2' : 'space-y-4'}>
            <div className="flex items-center justify-between">
                <Label className={compact ? 'text-xs' : ''}>Filter Conditions</Label>
                <div className="flex items-center gap-2">
                    {showLogicSelector && onLogicChange && (
                        <Select
                            value={logic}
                            onValueChange={(v) => onLogicChange(v as 'AND' | 'OR')}
                        >
                            <SelectTrigger className={COMPONENT_WIDTHS.LOGIC_SELECT}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="AND">AND</SelectItem>
                                <SelectItem value="OR">OR</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                    <Button variant="outline" size="sm" onClick={addCondition}>
                        <Plus className="w-4 h-4 mr-2" />
                        {addLabel}
                    </Button>
                </div>
            </div>

            {conditions.length === 0 ? (
                <div className={`text-center ${compact ? 'py-4' : 'py-6'} text-muted-foreground border-2 border-dashed rounded-lg`}>
                    <p className={compact ? 'text-xs' : 'text-sm'}>{emptyMessage}</p>
                </div>
            ) : (
                <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
                    {conditions.map((condition, index) => (
                        <FilterConditionRow
                            key={conditionKeys[index]}
                            condition={condition}
                            index={index}
                            fields={fields}
                            logic={logic}
                            showLogicBadge={showLogicSelector && index > 0}
                            fieldPlaceholder={fieldPlaceholder}
                            valuePlaceholder={valuePlaceholder}
                            compact={compact}
                            onUpdate={(updates) => updateCondition(index, updates)}
                            onRemove={() => removeCondition(index)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

interface FilterConditionRowProps {
    condition: FilterCondition;
    index: number;
    fields: string[];
    logic: 'AND' | 'OR';
    showLogicBadge: boolean;
    fieldPlaceholder: string;
    valuePlaceholder: string;
    compact: boolean;
    onUpdate: (updates: Partial<FilterCondition>) => void;
    onRemove: () => void;
}

function FilterConditionRow({
    condition,
    fields,
    logic,
    showLogicBadge,
    fieldPlaceholder,
    valuePlaceholder,
    compact,
    onUpdate,
    onRemove,
}: FilterConditionRowProps) {
    const operatorDef = COMPARISON_OPERATORS.find((op) => op.code === condition.operator);
    const showValueInput = !operatorDef?.noValue;

    return (
        <div className="flex items-center gap-2">
            {showLogicBadge && (
                <Badge variant="outline" className="w-12 justify-center flex-shrink-0">
                    {logic}
                </Badge>
            )}

            {/* Field Selector */}
            <Select
                value={condition.field || SENTINEL_VALUES.NONE}
                onValueChange={(v) => onUpdate({ field: v === SENTINEL_VALUES.NONE ? '' : v })}
            >
                <SelectTrigger className={compact ? 'flex-1 h-8' : 'flex-1'}>
                    <SelectValue placeholder={fieldPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={SENTINEL_VALUES.NONE}>{fieldPlaceholder}</SelectItem>
                    {fields.map((f) => (
                        <SelectItem key={f} value={f}>
                            {f}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Operator Selector */}
            <Select
                value={condition.operator}
                onValueChange={(v) => onUpdate({ operator: v as FilterOperator })}
            >
                <SelectTrigger className={compact ? `${COMPONENT_WIDTHS.OPERATOR_SELECT} h-8` : COMPONENT_WIDTHS.OPERATOR_SELECT}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {COMPARISON_OPERATORS.map((op) => (
                        <SelectItem key={op.code} value={op.code}>
                            {op.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Value Input (if operator requires it) */}
            {showValueInput && (
                <Input
                    value={String(condition.value ?? '')}
                    onChange={(e) => onUpdate({ value: e.target.value })}
                    placeholder={valuePlaceholder}
                    className={compact ? 'flex-1 h-8' : 'flex-1'}
                />
            )}

            {/* Remove Button */}
            <Button
                variant="ghost"
                size="icon"
                className={compact ? 'h-8 w-8' : ''}
                onClick={onRemove}
                aria-label="Remove condition"
            >
                <Trash2 className={compact ? 'w-3.5 h-3.5 text-destructive' : 'w-4 h-4 text-destructive'} />
            </Button>
        </div>
    );
}
