import * as React from 'react';
import {
    Button,
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@vendure/dashboard';
import type { ValidationIssue, ValidationState } from '../../../types';
import { DIALOG_DIMENSIONS, SCROLL_HEIGHTS } from '../../../constants';

export interface ValidationPanelProps {
    validation: ValidationState;
    isLoading: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ValidationPanel({
    validation,
    isLoading,
    open,
    onOpenChange,
}: ValidationPanelProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={DIALOG_DIMENSIONS.MAX_WIDTH_2XL}>
                <DialogHeader>
                    <DialogTitle>Validation Issues</DialogTitle>
                    <DialogDescription>Fix the following before publishing.</DialogDescription>
                </DialogHeader>
                <div className={`space-y-2 ${SCROLL_HEIGHTS.VALIDATION_PANEL} overflow-auto`}>
                    {isLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center">
                            <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                            <span>Validating...</span>
                        </div>
                    ) : validation.issues.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No issues.</div>
                    ) : (
                        validation.issues.map((issue) => (
                            <ValidationIssueItem key={`${issue.stepKey ?? 'global'}-${issue.field ?? 'none'}-${issue.message}`} issue={issue} />
                        ))
                    )}
                    {validation.warnings.length > 0 && (
                        <div className="mt-4">
                            <div className="text-sm font-medium text-amber-800 mb-2">Warnings</div>
                            {validation.warnings.map((warning) => (
                                <ValidationIssueItem key={`warning-${warning.stepKey ?? 'global'}-${warning.field ?? 'none'}-${warning.message}`} issue={warning} variant="warning" />
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex justify-end">
                    <DialogClose asChild>
                        <Button variant="outline">Close</Button>
                    </DialogClose>
                </div>
            </DialogContent>
        </Dialog>
    );
}

interface ValidationIssueItemProps {
    issue: ValidationIssue;
    variant?: 'error' | 'warning';
}

function ValidationIssueItem({ issue, variant = 'error' }: ValidationIssueItemProps) {
    const bgClass = variant === 'warning' ? 'bg-amber-50 border-amber-200' : '';

    return (
        <div className={`border rounded p-2 ${bgClass}`}>
            <div className="text-sm">{issue.message}</div>
            <div className="text-xs text-muted-foreground">
                {issue.stepKey ? `Step: ${issue.stepKey}` : ''}
                {issue.field ? ` - Field: ${issue.field}` : ''}
                {issue.reason ? ` - Code: ${issue.reason}` : ''}
            </div>
        </div>
    );
}

/**
 * Validation status badge component for inline display
 */
export interface ValidationStatusBadgeProps {
    validation: ValidationState;
    isLoading: boolean;
    onShowIssues: () => void;
}

export function ValidationStatusBadge({
    validation,
    isLoading,
    onShowIssues,
}: ValidationStatusBadgeProps) {
    if (isLoading) {
        return <span className="text-xs text-muted-foreground">Validating...</span>;
    }

    if (validation.isValid === true) {
        return <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Valid</span>;
    }

    if (validation.isValid === false) {
        return (
            <button
                type="button"
                className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 hover:underline"
                onClick={onShowIssues}
            >
                Issues: {validation.count}
            </button>
        );
    }

    return null;
}
