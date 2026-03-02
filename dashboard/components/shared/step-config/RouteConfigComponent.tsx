import React, { useCallback } from 'react';
import { Plus, Trash2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import {
    Button,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import { ROUTE_BRANCH_DEFAULTS, ERROR_MESSAGES } from '../../../constants';
import { useStableKeys } from '../../../hooks';
import { useComparisonOperators } from '../../../hooks/api/use-config-options';
import type { ComparisonOperatorOption } from '../../../hooks/api/use-config-options';

export interface RouteConfigComponentProps {
    readonly config: Record<string, unknown>;
    readonly onChange: (config: Record<string, unknown>) => void;
    readonly showDuplicateWarning?: boolean;
}

interface BranchCondition {
    field: string;
    cmp: string;
    value?: unknown;
}

interface Branch {
    name: string;
    when?: BranchCondition[];
}

export function RouteConfigComponent({
    config,
    onChange,
    showDuplicateWarning = true,
}: RouteConfigComponentProps) {
    const branches = (config.branches as Branch[]) ?? [];
    const branchKeys = useStableKeys(branches, 'branch');
    const { operators: comparisonOperators } = useComparisonOperators();

    const getDuplicateBranches = React.useCallback((branchList: Branch[]) => {
        const names = branchList.map((b) => b.name.trim().toLowerCase());
        const duplicates = new Set<string>();
        const seen = new Set<string>();
        for (const name of names) {
            if (name && seen.has(name)) {
                duplicates.add(name);
            }
            seen.add(name);
        }
        return duplicates;
    }, []);

    const duplicates = getDuplicateBranches(branches);
    const hasDuplicates = duplicates.size > 0;

    const addBranch = useCallback(() => {
        let branchNum = branches.length + 1;
        let newName = `${ROUTE_BRANCH_DEFAULTS.namePrefix}${branchNum}`;
        const existingNames = new Set(branches.map((b) => b.name.toLowerCase()));
        while (existingNames.has(newName.toLowerCase())) {
            branchNum++;
            newName = `${ROUTE_BRANCH_DEFAULTS.namePrefix}${branchNum}`;
        }

        onChange({
            ...config,
            branches: [...branches, { name: newName, when: [] }],
        });
    }, [branches, config, onChange]);

    const updateBranch = useCallback((index: number, patch: Partial<Branch>) => {
        const newBranches = [...branches];
        newBranches[index] = { ...newBranches[index], ...patch };
        onChange({ ...config, branches: newBranches });
    }, [branches, config, onChange]);

    const removeBranch = useCallback((index: number) => {
        onChange({ ...config, branches: branches.filter((_, i) => i !== index) });
    }, [branches, config, onChange]);

    const isBranchDuplicate = useCallback((branchName: string) => {
        return duplicates.has(branchName.trim().toLowerCase());
    }, [duplicates]);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Routing Branches</Label>
                <Button variant="outline" size="sm" onClick={addBranch}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add Branch
                </Button>
            </div>

            {showDuplicateWarning && hasDuplicates && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                    <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm font-medium">Duplicate branch names detected</span>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">
                        {ERROR_MESSAGES.DUPLICATE_BRANCH_NAMES}. Duplicate: {Array.from(duplicates).join(', ')}
                    </p>
                </div>
            )}

            {branches.map((branch, i) => (
                <BranchEditor
                    key={branchKeys[i]}
                    branch={branch}
                    isDuplicate={isBranchDuplicate(branch.name)}
                    comparisonOperators={comparisonOperators}
                    onUpdate={(patch) => updateBranch(i, patch)}
                    onRemove={() => removeBranch(i)}
                    index={i}
                />
            ))}

            {branches.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    Add branches to route records based on conditions.
                </p>
            )}
        </div>
    );
}

interface BranchEditorProps {
    branch: Branch;
    isDuplicate: boolean;
    comparisonOperators: ComparisonOperatorOption[];
    onUpdate: (patch: Partial<Branch>) => void;
    onRemove: () => void;
    index: number;
}

function BranchEditor({
    branch,
    isDuplicate,
    comparisonOperators,
    onUpdate,
    onRemove,
    index,
}: BranchEditorProps) {
    const conditions = branch.when ?? [];
    const [expanded, setExpanded] = React.useState(conditions.length > 0);

    const addCondition = useCallback(() => {
        const newConditions: BranchCondition[] = [...conditions, { field: '', cmp: 'eq', value: '' }];
        onUpdate({ when: newConditions });
        setExpanded(true);
    }, [conditions, onUpdate]);

    const updateCondition = useCallback((condIndex: number, patch: Partial<BranchCondition>) => {
        const newConditions = [...conditions];
        newConditions[condIndex] = { ...newConditions[condIndex], ...patch };
        onUpdate({ when: newConditions });
    }, [conditions, onUpdate]);

    const removeCondition = useCallback((condIndex: number) => {
        onUpdate({ when: conditions.filter((_, i) => i !== condIndex) });
    }, [conditions, onUpdate]);

    return (
        <div className="border rounded-md overflow-hidden">
            {/* Branch header: name + delete */}
            <div className="flex items-center gap-2 p-2 bg-muted/30">
                <button
                    type="button"
                    className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setExpanded(!expanded)}
                    aria-label={expanded ? 'Collapse conditions' : 'Expand conditions'}
                >
                    {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <div className="flex-1">
                    <Input
                        value={branch.name}
                        onChange={(e) => onUpdate({ name: e.target.value })}
                        placeholder="Branch name"
                        className={`h-8 ${isDuplicate ? 'border-amber-300 focus:border-amber-500' : ''}`}
                    />
                    {!branch.name.trim() && (
                        <p className="text-xs text-destructive mt-1">{ERROR_MESSAGES.BRANCH_NAME_EMPTY}</p>
                    )}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {conditions.length === 0 ? 'catch-all' : `${conditions.length} rule${conditions.length !== 1 ? 's' : ''}`}
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRemove}
                    className="text-destructive h-8 w-8 p-0"
                    aria-label={`Remove branch ${branch.name || index + 1}`}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            {/* Conditions section */}
            {expanded && (
                <div className="p-2 space-y-2 border-t">
                    {conditions.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-1">
                            All records (catch-all) -- add conditions to filter records into this branch
                        </p>
                    ) : (
                        <>
                            <p className="text-xs text-muted-foreground font-medium">
                                Conditions (all must match):
                            </p>
                            {conditions.map((cond, ci) => (
                                <ConditionRow
                                    key={ci}
                                    condition={cond}
                                    comparisonOperators={comparisonOperators}
                                    onUpdate={(patch) => updateCondition(ci, patch)}
                                    onRemove={() => removeCondition(ci)}
                                />
                            ))}
                        </>
                    )}
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addCondition}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add Condition
                    </Button>
                </div>
            )}
        </div>
    );
}

interface ConditionRowProps {
    condition: BranchCondition;
    comparisonOperators: ComparisonOperatorOption[];
    onUpdate: (patch: Partial<BranchCondition>) => void;
    onRemove: () => void;
}

function ConditionRow({ condition, comparisonOperators, onUpdate, onRemove }: ConditionRowProps) {
    const operatorDef = comparisonOperators.find((op) => op.value === condition.cmp);
    const showValueInput = !operatorDef?.noValue;

    return (
        <div className="flex items-center gap-1.5">
            {/* Field path */}
            <Input
                value={condition.field}
                onChange={(e) => onUpdate({ field: e.target.value })}
                placeholder="field.path"
                className="flex-1 h-7 text-xs font-mono"
            />

            {/* Comparison operator */}
            <Select value={condition.cmp} onValueChange={(v) => onUpdate({ cmp: v })}>
                <SelectTrigger className="w-[120px] h-7 text-xs">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {comparisonOperators.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                            {op.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Value */}
            {showValueInput && (
                <Input
                    value={formatConditionValue(condition.value)}
                    onChange={(e) => onUpdate({ value: parseConditionValue(e.target.value) })}
                    placeholder="value"
                    className="flex-1 h-7 text-xs"
                />
            )}

            {/* Remove */}
            <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                onClick={onRemove}
                aria-label="Remove condition"
            >
                <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
        </div>
    );
}

function formatConditionValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return '';
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'number') return String(value);
    return String(value);
}

function parseConditionValue(raw: string): unknown {
    const trimmed = raw.trim();
    if (trimmed === 'null') return null;
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed !== '' && !isNaN(Number(trimmed)) && trimmed === String(Number(trimmed))) {
        return Number(trimmed);
    }
    return raw;
}
