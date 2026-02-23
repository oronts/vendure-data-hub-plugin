import * as React from 'react';
import { memo, useCallback } from 'react';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, Separator } from '@vendure/dashboard';
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown, X } from 'lucide-react';
import { MOVE_DIRECTION } from '../../../constants';
import type { MoveDirection } from '../../../constants';
import { OperatorFieldInput, GenericArgInput, OperatorSchemaField } from './OperatorFieldInput';
import type { OperatorConfig } from '../../../../shared/types';

export type { OperatorConfig };

/**
 * Definition for step operators with schema-based configuration.
 * Note: This is distinct from ComparisonOperatorOption in hooks/api/use-config-options.ts
 * which defines comparison operators for filter conditions.
 */
export interface StepOperatorDefinition {
    code: string;
    name: string;
    description?: string;
    schema?: {
        fields: OperatorSchemaField[];
    };
}

interface OperatorCardProps {
    operator: OperatorConfig;
    index: number;
    isExpanded: boolean;
    totalCount: number;
    availableOperators: StepOperatorDefinition[];
    onToggleExpand: () => void;
    onUpdate: (updates: Partial<OperatorConfig>) => void;
    onUpdateArg: (key: string, value: unknown) => void;
    onRemove: () => void;
    onMove: (direction: MoveDirection) => void;
}

/**
 * Individual operator display with expand/collapse, delete, and reorder buttons.
 * Renders operator configuration fields when expanded.
 */
function OperatorCardComponent({
    operator,
    index,
    isExpanded,
    totalCount,
    availableOperators,
    onToggleExpand,
    onUpdate,
    onUpdateArg,
    onRemove,
    onMove,
}: OperatorCardProps) {
    const [isAddingArg, setIsAddingArg] = React.useState(false);
    const [newArgKey, setNewArgKey] = React.useState('');
    const operatorMeta = availableOperators.find(a => a.code === operator.op);
    const argEntries = Object.entries(operator.args || {});

    const handleOperatorTypeChange = useCallback((newOpCode: string) => {
        const newOpDef = availableOperators.find(a => a.code === newOpCode);
        const newArgs: Record<string, unknown> = {};
        if (newOpDef?.schema?.fields) {
            for (const field of newOpDef.schema.fields) {
                if (field.defaultValue !== undefined) {
                    newArgs[field.key] = field.defaultValue;
                } else if (field.required) {
                    newArgs[field.key] = '';
                }
            }
        }
        onUpdate({ op: newOpCode, args: newArgs });
    }, [availableOperators, onUpdate]);

    const handleRemoveArg = useCallback((key: string) => {
        const newArgs = { ...operator.args };
        delete newArgs[key];
        onUpdate({ args: newArgs });
    }, [operator.args, onUpdate]);

    const handleAddArg = useCallback(() => {
        setIsAddingArg(true);
        setNewArgKey('');
    }, []);

    const handleConfirmAddArg = useCallback(() => {
        if (newArgKey.trim()) {
            onUpdateArg(newArgKey.trim(), '');
        }
        setIsAddingArg(false);
        setNewArgKey('');
    }, [newArgKey, onUpdateArg]);

    const handleCancelAddArg = useCallback(() => {
        setIsAddingArg(false);
        setNewArgKey('');
    }, []);

    const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand();
        }
    }, [onToggleExpand]);

    return (
        <div
            className={`border rounded-lg transition-all duration-150 ${isExpanded ? 'border-primary/40 bg-muted/30 shadow-sm' : 'border-border bg-background hover:bg-muted/20 hover:border-muted-foreground/30'}`}
            data-testid={`datahub-operatorcard-card-${index}`}
        >
            {/* Header - always visible */}
            <div
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                aria-label={`Operator ${operator.op}, step ${index + 1} of ${totalCount}`}
                className="flex items-center justify-between p-3 cursor-pointer"
                onClick={onToggleExpand}
                onKeyDown={handleKeyDown}
            >
                <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                        {index + 1}
                    </div>
                    {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    }
                    <span className="font-medium text-sm">{operatorMeta?.name ?? operator.op}</span>
                    {!isExpanded && argEntries.length > 0 && (
                        <span className="text-[11px] text-muted-foreground font-mono ml-1 truncate max-w-[200px]">
                            ({argEntries.map(([k]) => k).join(', ')})
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-0.5">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => { e.stopPropagation(); onMove(MOVE_DIRECTION.UP); }}
                        disabled={index === 0}
                        aria-label="Move operator up"
                    >
                        <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => { e.stopPropagation(); onMove(MOVE_DIRECTION.DOWN); }}
                        disabled={index === totalCount - 1}
                        aria-label="Move operator down"
                    >
                        <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); onRemove(); }}
                        aria-label="Remove operator"
                    >
                        <X className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>

            {/* Expanded content */}
            {isExpanded && (
                <div className="px-3 pb-3 pt-0 space-y-4">
                    <Separator />
                    {/* Operator type selector */}
                    <div>
                        <Label className="text-xs font-medium">Operator Type</Label>
                        <Select
                            value={operator.op}
                            onValueChange={handleOperatorTypeChange}
                        >
                            <SelectTrigger className="mt-1.5 h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {availableOperators.map(a => (
                                    <SelectItem key={a.code} value={a.code}>{a.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Schema-based fields or generic args */}
                    {operatorMeta?.schema?.fields && operatorMeta.schema.fields.length > 0 ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Label className="text-xs font-medium">Configuration</Label>
                                <span className="text-[10px] text-muted-foreground">
                                    {operatorMeta.schema.fields.length} field{operatorMeta.schema.fields.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            <div className="space-y-3 pl-0.5">
                                {operatorMeta.schema.fields.map((field) => (
                                    <OperatorFieldInput
                                        key={field.key}
                                        field={field}
                                        value={operator.args?.[field.key]}
                                        onChange={onUpdateArg}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-medium">Arguments</Label>
                                {!isAddingArg && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={handleAddArg}
                                    >
                                        + Add Arg
                                    </Button>
                                )}
                            </div>
                            {isAddingArg && (
                                <div className="flex items-center gap-2 mt-2">
                                    <Input
                                        value={newArgKey}
                                        onChange={(e) => setNewArgKey(e.target.value)}
                                        placeholder="Argument key"
                                        className="h-9 text-sm"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleConfirmAddArg();
                                            if (e.key === 'Escape') handleCancelAddArg();
                                        }}
                                    />
                                    <Button size="sm" className="h-8" onClick={handleConfirmAddArg}>Add</Button>
                                    <Button size="sm" variant="ghost" className="h-8" onClick={handleCancelAddArg}>Cancel</Button>
                                </div>
                            )}
                            {argEntries.length === 0 && !isAddingArg ? (
                                <p className="text-xs text-muted-foreground mt-2">No arguments configured.</p>
                            ) : (
                                <div className="mt-2 space-y-2">
                                    {argEntries.map(([key, value]) => (
                                        <GenericArgInput
                                            key={key}
                                            argKey={key}
                                            value={value}
                                            onChange={onUpdateArg}
                                            onRemove={handleRemoveArg}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export const OperatorCard = memo(OperatorCardComponent);
