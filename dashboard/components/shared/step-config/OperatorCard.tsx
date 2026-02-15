import * as React from 'react';
import { memo, useCallback } from 'react';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@vendure/dashboard';
import { MOVE_DIRECTION } from '../../../constants';
import type { MoveDirection } from '../../../constants';
import { OperatorFieldInput, GenericArgInput, OperatorSchemaField } from './OperatorFieldInput';

export interface OperatorConfig {
    op: string;
    args?: Record<string, unknown>;
}

/**
 * Definition for step operators with schema-based configuration.
 * Note: This is distinct from OperatorDefinition in constants/operators.ts
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
            className={`border rounded-md transition-colors ${isExpanded ? 'border-primary/40 bg-muted/50' : 'border-border bg-background hover:bg-muted/30'}`}
            data-testid={`datahub-operatorcard-card-${index}`}
        >
            {/* Header - always visible */}
            <div
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                aria-label={`Operator ${operator.op}, step ${index + 1} of ${totalCount}`}
                className="flex items-center justify-between p-2.5 cursor-pointer"
                onClick={onToggleExpand}
                onKeyDown={handleKeyDown}
            >
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground/70 w-4">{index + 1}</span>
                    <span className="text-xs text-muted-foreground">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                    <span className="font-medium text-sm">{operator.op}</span>
                    {!isExpanded && argEntries.length > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">
                            ({argEntries.map(([k]) => k).join(', ')})
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => { e.stopPropagation(); onMove(MOVE_DIRECTION.UP); }}
                        disabled={index === 0}
                        aria-label="Move operator up"
                    >
                        {'\u2191'}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => { e.stopPropagation(); onMove(MOVE_DIRECTION.DOWN); }}
                        disabled={index === totalCount - 1}
                        aria-label="Move operator down"
                    >
                        {'\u2193'}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-destructive"
                        onClick={(e) => { e.stopPropagation(); onRemove(); }}
                        aria-label="Remove operator"
                    >
                        {'\u00D7'}
                    </Button>
                </div>
            </div>

            {/* Expanded content */}
            {isExpanded && (
                <div className="px-3 pb-3 pt-2 border-t border-border/50 space-y-3">
                    {/* Operator type selector */}
                    <div>
                        <Label className="text-xs">Operator Type</Label>
                        <Select
                            value={operator.op}
                            onValueChange={handleOperatorTypeChange}
                        >
                            <SelectTrigger className="mt-1">
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
                        <div className="space-y-3">
                            <Label className="text-xs">Configuration</Label>
                            {operatorMeta.schema.fields.map((field) => (
                                <OperatorFieldInput
                                    key={field.key}
                                    field={field}
                                    value={operator.args?.[field.key]}
                                    onChange={onUpdateArg}
                                />
                            ))}
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between">
                                <Label className="text-xs">Arguments</Label>
                                {!isAddingArg && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-xs"
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
                                        className="h-8 text-sm"
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
                                <p className="text-xs text-muted-foreground mt-1">No arguments configured.</p>
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
