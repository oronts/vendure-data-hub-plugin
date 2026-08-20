import React, { useCallback } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Plus, Trash2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import { ROUTE_BRANCH_DEFAULTS } from '../../../constants';
import { useStableKeys, useStableIndexIds } from '../../../hooks';
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
    const { t } = useLingui();
    const branches = React.useMemo(
        () => (config.branches as Branch[]) ?? [],
        [config.branches],
    );
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
                <h4 className="text-sm font-medium">
                    <Trans>Routing branches</Trans>
                </h4>
                <Button variant="outline" size="sm" onClick={addBranch}>
                    <Plus className="h-3 w-3 mr-1" />
                    <Trans>Add branch</Trans>
                </Button>
            </div>

            {showDuplicateWarning && hasDuplicates && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                    <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm font-medium"><Trans>Duplicate branch names detected</Trans></span>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">
                        {t`Branch names must be unique. Duplicates: ${Array.from(duplicates).join(', ')}`}
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
                    <Trans>Add branches to route records based on conditions.</Trans>
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
    const { t } = useLingui();
    const conditions = React.useMemo(() => branch.when ?? [], [branch.when]);
    const conditionKeys = useStableIndexIds(conditions, `branch-${index}-cond`);
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
            <div className="flex items-center gap-2 p-2 bg-muted/30">
                <button
                    type="button"
                    className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setExpanded(!expanded)}
                    aria-label={expanded ? t`Collapse conditions` : t`Expand conditions`}
                >
                    {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <div className="flex-1">
                    <Input
                        aria-label={t`Branch name`}
                        value={branch.name}
                        onChange={(e) => onUpdate({ name: e.target.value })}
                        placeholder={t`Branch name`}
                        className={`h-8 ${isDuplicate ? 'border-amber-300 focus:border-amber-500' : ''}`}
                    />
                    {!branch.name.trim() && (
                        <p className="text-xs text-destructive mt-1"><Trans>Branch name is required.</Trans></p>
                    )}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {conditions.length === 0
                        ? t`catch-all`
                        : conditions.length === 1
                            ? t`${conditions.length} rule`
                            : t`${conditions.length} rules`}
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRemove}
                    className="text-destructive h-8 w-8 p-0"
                    aria-label={t`Remove branch ${branch.name || index + 1}`}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            {expanded && (
                <div className="p-2 space-y-2 border-t">
                    {conditions.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-1">
                            <Trans>All records (catch-all) — add conditions to filter records into this branch.</Trans>
                        </p>
                    ) : (
                        <>
                            <p className="text-xs text-muted-foreground font-medium">
                                <Trans>Conditions (all must match):</Trans>
                            </p>
                            {conditions.map((cond, ci) => (
                                <ConditionRow
                                    key={conditionKeys[ci]}
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
                        <Trans>Add condition</Trans>
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
    const { t } = useLingui();
    const operatorDef = comparisonOperators.find((op) => op.value === condition.cmp);
    const showValueInput = !operatorDef?.noValue;

    return (
        <div className="flex items-center gap-1.5">
            {/* Field path */}
            <Input
                aria-label={t`Field name`}
                value={condition.field}
                onChange={(e) => onUpdate({ field: e.target.value })}
                placeholder="field.path"
                className="flex-1 h-7 text-xs font-mono"
            />

            {/* Comparison operator */}
            <Select
                value={condition.cmp}
                onValueChange={v => {
                    if (v != null) onUpdate({ cmp: v });
                }}
            >
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
                    aria-label={t`Select...`}
                    value={formatConditionValue(condition.value)}
                    onChange={(e) => onUpdate({ value: parseConditionValue(e.target.value) })}
                    placeholder={t`Select...`}
                    className="flex-1 h-7 text-xs"
                />
            )}

            {/* Remove */}
            <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                onClick={onRemove}
                aria-label={t`Remove condition`}
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
