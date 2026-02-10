import * as React from 'react';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@vendure/dashboard';
import { COMPARISON_OPERATORS } from '../../../constants';

type ButtonSize = 'sm' | 'default' | 'lg' | 'icon';
type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';

export function OperatorCheatSheetButton({ label = 'Operator cheat-sheet', size = 'sm', variant = 'outline' }: { label?: string; size?: ButtonSize; variant?: ButtonVariant }) {
    const [open, setOpen] = React.useState(false);
    return (
        <>
            <Button variant={variant} size={size} onClick={() => setOpen(true)}>{label}</Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Operator cheat-sheet</DialogTitle>
                        <DialogDescription>Quick reference for rule operators</DialogDescription>
                    </DialogHeader>
                    <div className="text-[12px] grid grid-cols-1 gap-2">
                        {COMPARISON_OPERATORS.map(op => (
                            <div key={op.code}>
                                <b>{op.code}</b> {'\u2014'} {op.description}
                                {op.example && <span className="text-muted-foreground ml-1">(e.g. {op.example})</span>}
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
