import React, { useCallback } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Button, Input, Label } from '@vendure/dashboard';
import { ROUTE_BRANCH_DEFAULTS, ERROR_MESSAGES } from '../../../constants';
import { useStableKeys } from '../../../hooks';

export interface RouteConfigComponentProps {
    readonly config: Record<string, unknown>;
    readonly onChange: (config: Record<string, unknown>) => void;
    readonly showDuplicateWarning?: boolean;
}

interface Branch {
    name: string;
    conditions?: unknown[];
}

export function RouteConfigComponent({
    config,
    onChange,
    showDuplicateWarning = true,
}: RouteConfigComponentProps) {
    const branches = (config.branches as Branch[]) ?? [];
    const branchKeys = useStableKeys(branches, 'branch');

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
            branches: [...branches, { name: newName, conditions: [] }],
        });
    }, [branches, config, onChange]);

    const updateBranch = useCallback((index: number, patch: Record<string, unknown>) => {
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
                    <p className="text-xs text-amber-700 mt-1">
                        {ERROR_MESSAGES.DUPLICATE_BRANCH_NAMES}. Duplicate: {Array.from(duplicates).join(', ')}
                    </p>
                </div>
            )}

            {branches.map((branch, i) => (
                <div key={branchKeys[i]} className="flex items-center gap-2 p-2 border rounded">
                    <div className="flex-1">
                        <Input
                            value={branch.name}
                            onChange={(e) => updateBranch(i, { name: e.target.value })}
                            placeholder="Branch name"
                            className={isBranchDuplicate(branch.name) ? 'border-amber-300 focus:border-amber-500' : ''}
                        />
                                                {!branch.name.trim() && (
                            <p className="text-xs text-destructive mt-1">{ERROR_MESSAGES.BRANCH_NAME_EMPTY}</p>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeBranch(i)}
                        className="text-destructive"
                        aria-label={`Remove branch ${branch.name || i + 1}`}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            ))}

            {branches.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    Add branches to route records based on conditions.
                </p>
            )}
        </div>
    );
}
